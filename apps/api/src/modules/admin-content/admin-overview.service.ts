import { Injectable, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AdminSummaryService } from '../../common/admin-summary/admin-summary.service';
import { dailyDue } from '../../common/admin-summary/snapshot-gate';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { liveSubscriptionWhere } from '../admin/subscription-metrics';
import { maxAssistantSeats } from '../billing/seat-limit';
import {
  effectiveSeats,
  paidSeats,
} from '../subscriptions/contract-grant.util';
import type { AdminOverviewDto } from './admin-content.dto';

/** The stored copy of GET /admin/overview (AdminSummaryService key). */
export const ADMIN_OVERVIEW_KEY = 'overview';

/**
 * GET /admin/overview: 17 counts over the big tables (users by role,
 * messages, calls, cases, bids, posts of the last 7 days…).
 *
 * Row 78 (load test 13.11, 10M users): the copy used to be recounted every
 * 5 minutes INSIDE a request, and with no stored copy every waiter gave up
 * after 4 s and counted again by itself while the first count (~25 s) was
 * still running: 24 counts at once, COUNT(*) users by role 12.4 s each,
 * p95 26 s. Owner rule (admin numbers from the nightly snapshot): the page
 * now only READS the stored snapshot, like Analytics; the daily
 * `admin.summaries` run recounts it (snapshot-gate.ts, 04 UTC); only when
 * nothing was ever stored does the first read count it once, and every
 * other reader waits for that one count (AdminSummaryService lock).
 */
@Injectable()
export class AdminOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly settings?: AppSettingsService,
    @Optional() private readonly summary?: AdminSummaryService,
  ) {}

  /** The stored snapshot (any age); counted once when nothing is stored. */
  async overview(): Promise<AdminOverviewDto> {
    if (!this.summary) return this.compute();
    const hit = await this.summary.peek<AdminOverviewDto>(ADMIN_OVERVIEW_KEY);
    if (hit) return hit.data;
    return (
      await this.summary.refresh(ADMIN_OVERVIEW_KEY, () => this.compute(), true)
    ).data;
  }

  /** `admin.summaries`: recount when the daily snapshot is due. */
  async refreshDaily(): Promise<void> {
    if (!this.summary) return;
    const hit = await this.summary.peek<AdminOverviewDto>(ADMIN_OVERVIEW_KEY);
    if (dailyDue(hit?.computedAt)) {
      await this.summary.refresh(ADMIN_OVERVIEW_KEY, () => this.compute());
    }
  }

  /** The 17 counts themselves (only the snapshot paths call this). */
  private async compute(): Promise<AdminOverviewDto> {
    const d7 = new Date(Date.now() - 7 * 86400000);
    const d30 = new Date(Date.now() - 30 * 86400000);
    // Audit 2026-10-02: the gate's rule (past_due only while in grace),
    // shared with the dashboard tiles — see subscription-metrics.ts.
    const live = liveSubscriptionWhere(new Date());
    const [
      clients,
      attorneys,
      attorneysVerified,
      assistants,
      monthly,
      yearly,
      seats,
      revenue,
      cases7d,
      bids7d,
      posts7d,
      messages7d,
      calls7d,
      callsMissed7d,
      tasksOpen,
      tasksDone30d,
      requestsPending,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: 'client', deleted_at: null } }),
      this.prisma.user.count({ where: { role: 'attorney', deleted_at: null } }),
      this.prisma.attorneyProfile.count({
        where: { verification_status: 'verified' },
      }),
      this.prisma.assistantMembership.count({ where: { status: 'active' } }),
      this.prisma.subscription.count({
        where: { ...live, plan: 'monthly' },
      }),
      this.prisma.subscription.count({
        where: { ...live, plan: 'yearly' },
      }),
      this.prisma.subscription.aggregate({
        where: { ...live, plan: 'monthly' },
        _sum: { assistant_seats: true },
      }),
      this.prisma.payment.aggregate({
        where: { status: 'succeeded', paid_at: { gte: d30 } },
        _sum: { amount_cents: true },
      }),
      this.prisma.case.count({ where: { created_at: { gte: d7 } } }),
      this.prisma.bid.count({ where: { created_at: { gte: d7 } } }),
      this.prisma.post.count({ where: { created_at: { gte: d7 } } }),
      this.prisma.message.count({ where: { created_at: { gte: d7 } } }),
      this.prisma.call.count({ where: { created_at: { gte: d7 } } }),
      this.prisma.call.count({
        where: { created_at: { gte: d7 }, status: 'missed' },
      }),
      this.prisma.attorneyTask.count({
        where: { status: { in: ['open', 'taken'] } },
      }),
      this.prisma.attorneyTask.count({
        where: { status: 'done', done_at: { gte: d30 } },
      }),
      this.prisma.assistantRequest.count({ where: { status: 'pending' } }),
    ]);
    return {
      clients,
      attorneys,
      attorneysVerified,
      assistants,
      subscriptionsMonthly: monthly,
      subscriptionsYearly: yearly,
      assistantSeats:
        (seats._sum.assistant_seats ?? 0) +
        yearly * 6 +
        (await this.extraGrantSeats(live)),
      revenue30dCents: revenue._sum.amount_cents ?? 0,
      cases7d,
      bids7d,
      posts7d,
      messages7d,
      calls7d,
      callsMissed7d,
      tasksOpen,
      tasksDone30d,
      requestsPending,
    };
  }

  /** Owner 2026-10-02: seats an active contract grant adds on top of the
   * paid ones (per attorney: max(paid, grant) − paid). */
  private async extraGrantSeats(
    live: Prisma.SubscriptionWhereInput,
  ): Promise<number> {
    const now = new Date();
    const grants = await this.prisma.contractGrant.findMany({
      where: {
        revoked_at: null,
        starts_at: { lte: now },
        ends_at: { gt: now },
        assistant_seats: { gt: 0 },
      },
      select: { user_id: true, assistant_seats: true },
    });
    if (grants.length === 0) return 0;
    const byUser = new Map<string, number>();
    for (const g of grants) {
      byUser.set(
        g.user_id,
        Math.max(byUser.get(g.user_id) ?? 0, g.assistant_seats),
      );
    }
    const subs = await this.prisma.subscription.findMany({
      where: { ...live, user_id: { in: [...byUser.keys()] } },
      select: { user_id: true, plan: true, assistant_seats: true },
    });
    const maxSeats = await maxAssistantSeats(this.settings);
    const paid = new Map(subs.map((x) => [x.user_id, paidSeats(x, maxSeats)]));
    let extra = 0;
    for (const [userId, g] of byUser) {
      const p = paid.get(userId) ?? 0;
      extra += effectiveSeats(p, g) - p;
    }
    return extra;
  }
}
