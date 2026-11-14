import { Injectable, Optional } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { AdminSummaryService } from '../../common/admin-summary/admin-summary.service';
import { dailyDue } from '../../common/admin-summary/snapshot-gate';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { forEachDatabase } from '../../sharding/for-each-database';
import { liveSubscriptionWhere } from '../admin/subscription-metrics';
import { maxAssistantSeats } from '../billing/seat-limit';
import {
  effectiveSeats,
  paidSeats,
} from '../subscriptions/contract-grant.util';
import type { AdminOverviewDto } from './admin-content.dto';

/** The stored copy of GET /admin/overview (AdminSummaryService key). */
export const ADMIN_OVERVIEW_KEY = 'overview';

const HOUR_MS = 3_600_000;

/** Start of the UTC hour [d] falls in (the counters' bucket). */
export function hourFloor(d: Date): Date {
  return new Date(Math.floor(d.getTime() / HOUR_MS) * HOUR_MS);
}

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
 *
 * Row 78 part 2 (1B messages): «messages in 7 days» was COUNT(*) over the
 * whole messages table (> 30 s, every compute failed) and the two «users by
 * role» counts a seq scan of users. They now read `stat_counters`, exact
 * counts kept by triggers in the same transaction as each write (migration
 * 20261128110000_stat_counters): live messages per UTC hour, live users by
 * role. The 7-day window starts at the hour of now − 7 days (the daily run
 * is at 04 UTC, so a few minutes wider than before at most).
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
      counters,
      attorneysVerified,
      assistants,
      monthly,
      yearly,
      seats,
      revenue,
      cases7d,
      bids7d,
      posts7d,
      calls7d,
      callsMissed7d,
      tasksOpen,
      tasksDone30d,
      requestsPending,
    ] = await Promise.all([
      this.counters(hourFloor(d7)),
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
      clients: counters.clients,
      attorneys: counters.attorneys,
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
      messages7d: counters.messages,
      calls7d,
      callsMissed7d,
      tasksOpen,
      tasksDone30d,
      requestsPending,
    };
  }

  /** Row 78: live users by role and live messages since [since] from the
   * trigger-kept counters, summed over every physical database (messages
   * can live on a shard database; a few hundred rows each). */
  private async counters(
    since: Date,
  ): Promise<{ clients: number; attorneys: number; messages: number }> {
    const parts = await forEachDatabase(
      this.prisma,
      () => this.prisma.$queryRaw<{ metric: string; n: bigint | number }[]>`
        SELECT metric, COALESCE(SUM(n), 0)::bigint AS n
          FROM stat_counters
         WHERE (metric = 'messages' AND bucket >= ${since})
            OR metric IN ('users.live.client', 'users.live.attorney')
         GROUP BY metric`,
      { withPrimary: true },
    );
    const sum = (metric: string) =>
      parts
        .flat()
        .filter((r) => r.metric === metric)
        .reduce((acc, r) => acc + Number(r.n), 0);
    return {
      clients: sum('users.live.client'),
      attorneys: sum('users.live.attorney'),
      messages: sum('messages'),
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
