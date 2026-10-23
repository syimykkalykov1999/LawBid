import { Injectable, Optional } from '@nestjs/common';
import { AdminSummaryService } from '../../common/admin-summary/admin-summary.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { DashboardDto } from './admin.dto';
import {
  liveSubscriptionWhere,
  monthlyRevenueCents,
  payingSubscriptionWhere,
} from './subscription-metrics';
export const DASHBOARD_SUMMARY_KEY = 'dashboard';
/** Older than this, a read still answers at once and one process recounts. */
const FRESH_SECONDS = 150;
const DAY_MS = 86_400_000;

/**
 * docs/06 §2.3 item 1. Fourteen counts. Owner 2026-10-23 (admin economy
 * pass): they are no longer counted on request — the worker's
 * `admin.summaries` cron recounts them every two minutes into Redis
 * (AdminSummaryService) and a request only reads the stored value (a
 * stale one is still served at once while one process recounts).
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly summary?: AdminSummaryService,
  ) {}

  async get(): Promise<DashboardDto> {
    if (!this.summary) return this.compute();
    return (
      await this.summary.get(
        DASHBOARD_SUMMARY_KEY,
        () => this.compute(),
        FRESH_SECONDS,
      )
    ).data;
  }

  /** The cron's entry: recount now and store. */
  async refresh(): Promise<void> {
    if (this.summary)
      await this.summary.refresh(DASHBOARD_SUMMARY_KEY, () => this.compute());
  }

  private async compute(): Promise<DashboardDto> {
    const now = new Date();
    const since24h = new Date(now.getTime() - DAY_MS);
    const since7d = new Date(now.getTime() - 7 * DAY_MS);
    const p = this.prisma;
    const [
      clients24h,
      attorneys24h,
      clients7d,
      attorneys7d,
      queueSize,
      oldest,
      trialing,
      active,
      pastDue,
      openCases,
      bids24h,
      invites24h,
      openReports,
      openDisputes,
      openContactIssues,
      seatLimitRequests,
      live,
      revenueByPlan,
      fraudQueue,
      fraudBlocked7d,
    ] = await Promise.all([
      p.user.count({
        where: { role: 'client', created_at: { gte: since24h } },
      }),
      p.user.count({
        where: { role: 'attorney', created_at: { gte: since24h } },
      }),
      p.user.count({ where: { role: 'client', created_at: { gte: since7d } } }),
      p.user.count({
        where: { role: 'attorney', created_at: { gte: since7d } },
      }),
      p.verificationRequest.count({
        where: { status: { in: ['submitted', 'in_review'] } },
      }),
      p.verificationRequest.findFirst({
        where: { status: { in: ['submitted', 'in_review'] } },
        orderBy: { submitted_at: 'asc' },
        select: { submitted_at: true },
      }),
      p.subscription.count({ where: { status: 'trialing' } }),
      p.subscription.count({ where: { status: 'active' } }),
      p.subscription.count({ where: { status: 'past_due' } }),
      p.case.count({ where: { status: 'open' } }),
      p.bid.count({ where: { created_at: { gte: since24h } } }),
      // Owner 2026-10-05: client → attorney case invites.
      p.caseInvite.count({ where: { created_at: { gte: since24h } } }),
      p.report.count({ where: { status: 'open' } }),
      p.caseDispute.count({ where: { status: 'open' } }),
      p.contactIssueReport.count({ where: { status: 'open' } }),
      p.seatLimitRequest.count({ where: { status: 'pending' } }),
      // Audit 2026-10-02: the same "live" rule as the overview and the gate.
      p.subscription.count({ where: liveSubscriptionWhere(now) }),
      p.subscription.groupBy({
        by: ['plan'],
        where: payingSubscriptionWhere(now),
        _sum: { price_cents: true },
      }),
      // Owner 2026-10-05 (client fraud): Галочки → «Борьба с мошенниками».
      p.clientFraudProfile.count({
        where: { status: { in: ['review', 'restricted'] } },
      }),
      p.clientFraudEvent.count({
        where: {
          kind: { in: ['sign_in_blocked', 'auto_banned', 'linked_banned'] },
          created_at: { gte: since7d },
        },
      }),
    ]);
    const revenueCents = monthlyRevenueCents(
      revenueByPlan.map((r) => ({
        plan: r.plan,
        priceCents: r._sum.price_cents ?? 0,
      })),
    );
    return {
      newUsers: { clients24h, attorneys24h, clients7d, attorneys7d },
      verification: {
        queueSize,
        oldestAgeSeconds: oldest?.submitted_at
          ? Math.floor((now.getTime() - oldest.submitted_at.getTime()) / 1000)
          : null,
      },
      subscriptions: {
        trialing,
        active,
        pastDue,
        live,
        revenueEstimateCents: revenueCents,
        revenueEstimateUsd: Math.round(revenueCents / 100),
      },
      openCases,
      bids24h,
      invites24h,
      openReports,
      openDisputes,
      openContactIssues,
      seatLimitRequests,
      fraudQueue,
      fraudBlocked7d,
      computedAt: now.toISOString(),
    };
  }
}
