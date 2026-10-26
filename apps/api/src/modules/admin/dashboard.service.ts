import { Injectable, Optional } from '@nestjs/common';
import { AdminSummaryService } from '../../common/admin-summary/admin-summary.service';
import {
  dailyDue,
  withSnapshotTimeout,
} from '../../common/admin-summary/snapshot-gate';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  DashboardDto,
  DashboardRoleTotalsDto,
  DashboardTotalsDto,
} from './admin.dto';
import {
  liveSubscriptionWhere,
  monthlyRevenueCents,
  payingSubscriptionWhere,
} from './subscription-metrics';
export const DASHBOARD_SUMMARY_KEY = 'dashboard';
/** Older than this, a read still answers at once and one process recounts. */
const FRESH_SECONDS = 150;
export const USER_TOTALS_KEY = 'user-totals';
const DAY_MS = 86_400_000;
/** The admin button recounts at most this often. */
export const TOTALS_BUTTON_COOLDOWN_MS = 10 * 60_000;

export interface UserRoleRow {
  role: string;
  total: bigint | number;
  active: bigint | number;
  verified: bigint | number;
}
export interface AssistantRow {
  total: bigint | number;
  active: bigint | number;
}
const n = (v: bigint | number | undefined) => Number(v ?? 0);

/** Pure: GROUP BY rows -> the totals block (without the stamp). */
export function buildTotals(
  rows: UserRoleRow[],
  assistants: AssistantRow | undefined,
  computedAt: string,
): DashboardTotalsDto {
  const by = (role: string, withVerified: boolean): DashboardRoleTotalsDto => {
    const r = rows.find((x) => x.role === role);
    return {
      total: n(r?.total),
      active: n(r?.active),
      verified: withVerified ? n(r?.verified) : null,
    };
  };
  const clients = by('client', true);
  const attorneys = by('attorney', true);
  const admins = by('admin', false);
  const seats: DashboardRoleTotalsDto = {
    total: n(assistants?.total),
    active: n(assistants?.active),
    verified: null,
  };
  const parts = [clients, attorneys, admins, seats];
  return {
    clients,
    attorneys,
    assistants: seats,
    admins,
    all: {
      total: parts.reduce((a, x) => a + x.total, 0),
      active: parts.reduce((a, x) => a + x.active, 0),
      verified: null,
    },
    computedAt,
  };
}

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

  /**
   * Owner 2026-10-25: the admin button «Обновить» for the user totals.
   * At most once per 10 minutes (a fresher stored value is returned as is);
   * recounts the totals and the dashboard summary that carries them.
   */
  async refreshTotals(): Promise<void> {
    const hit = await this.summary?.peek<DashboardTotalsDto>(USER_TOTALS_KEY);
    if (
      hit &&
      Date.now() - Date.parse(hit.computedAt) < TOTALS_BUTTON_COOLDOWN_MS
    )
      return;
    if (this.summary) {
      await this.summary.refresh(USER_TOTALS_KEY, () => this.countTotals());
      await this.refresh();
    }
  }

  /**
   * Totals ride on the dashboard summary but are counted once a day: the
   * cron (every 2 min) reuses the stored value until it is 24 h old.
   */
  async totals(): Promise<DashboardTotalsDto> {
    if (!this.summary) return this.countTotals();
    const hit = await this.summary.peek<DashboardTotalsDto>(USER_TOTALS_KEY);
    if (hit && !dailyDue(hit.computedAt)) return hit.data;
    return (
      await this.summary.refresh(USER_TOTALS_KEY, () => this.countTotals())
    ).data;
  }

  /** One GROUP BY role over users (+ one tiny one over assistant seats). */
  async countTotals(): Promise<DashboardTotalsDto> {
    const [rows, seats] = await withSnapshotTimeout(
      this.prisma,
      async (p) =>
        [
          await p.$queryRaw<UserRoleRow[]>`
        SELECT u.role::text AS role,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE u.status = 'active') AS active,
               COUNT(*) FILTER (WHERE ap.verification_status = 'verified'
                                   OR cv.status = 'approved') AS verified
          FROM users u
          LEFT JOIN attorney_profiles ap ON ap.user_id = u.id
          LEFT JOIN client_verifications cv ON cv.user_id = u.id
         WHERE u.role IS NOT NULL AND u.status <> 'deleted'
           AND u.deleted_at IS NULL
         GROUP BY u.role`,
          await p.$queryRaw<AssistantRow[]>`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = 'active') AS active
          FROM assistant_memberships
         WHERE status <> 'removed'`,
        ] as const,
    );
    return buildTotals(rows, seats[0], new Date().toISOString());
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
    const totals = await this.totals();
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
      totals,
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
