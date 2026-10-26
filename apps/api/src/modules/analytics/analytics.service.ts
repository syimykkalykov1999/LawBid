import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { AdminSummaryService } from '../../common/admin-summary/admin-summary.service';
import {
  dailyDue,
  withSnapshotTimeout,
} from '../../common/admin-summary/snapshot-gate';
import { demoContext } from '../../common/demo/demo-context';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type { AnalyticsDto } from './analytics.dto';
import { AppEventsService } from './app-events.service';

/** Period lengths the admin page offers; the daily job keeps all of them. */
export const ANALYTICS_SNAPSHOT_DAYS = [7, 30, 90] as const;
const analyticsKey = (days: number) => `analytics:${days}`;
const DAY_MS = 86_400_000;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Owner 2026-10-15: our own analytics, free, in our database: who opened
 * the app (DAU / MAU / WAU), how new people move to the first action and
 * the first payment, who stopped coming, what was bought (subscriptions and
 * Boost). Counted from rows we already have plus one small table
 * (`user_activity_days`, one row per person per day).
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly appEvents: AppEventsService,
    @Optional() private readonly summary?: AdminSummaryService,
  ) {}

  /** The person opened the app today: one write a day, not one per call. */
  touch(userId: string): void {
    if (demoContext.isDemo()) return;
    const today = dayKey(new Date());
    void this.redis
      .set(`act:${today}:${userId}`, '1', 'EX', 36 * 3600, 'NX')
      .then(async (fresh) => {
        if (fresh === null) return;
        await this.prisma.$executeRaw`
          INSERT INTO user_activity_days (user_id, day)
          VALUES (${userId}::UUID, ${today}::DATE)
          ON CONFLICT DO NOTHING`;
      })
      .catch(() => undefined);
  }

  /**
   * Owner 2026-10-25: the page only READS the stored snapshot (counted by
   * the daily `admin.summaries` run). Only when nothing was ever stored does
   * the first read compute it once (shared lock), so the page is never empty.
   */
  async overview(days: number): Promise<AnalyticsDto> {
    if (!this.summary) return this.compute(days);
    const hit = await this.summary.peek<AnalyticsDto>(analyticsKey(days));
    if (hit) return hit.data;
    return (
      await this.summary.refresh(
        analyticsKey(days),
        () => this.compute(days),
        true,
      )
    ).data;
  }

  /** The daily job's entry: recount the periods that are due. */
  async refreshSnapshots(): Promise<void> {
    if (!this.summary) return;
    for (const days of ANALYTICS_SNAPSHOT_DAYS) {
      const hit = await this.summary.peek<AnalyticsDto>(analyticsKey(days));
      if (dailyDue(hit?.computedAt))
        await this.summary.refresh(analyticsKey(days), () =>
          this.compute(days),
        );
    }
  }

  private compute(days: number): Promise<AnalyticsDto> {
    return withSnapshotTimeout(this.prisma, (p) => this.computeWith(p, days));
  }

  private async computeWith(
    p: PrismaService,
    days: number,
  ): Promise<AnalyticsDto> {
    const now = new Date();
    const since = new Date(now.getTime() - days * DAY_MS);
    const today = dayKey(now);

    const events = await this.appEvents.top(days);
    const [series, signups, actives, funnel, retention, churn, buys] =
      await Promise.all([
        p.$queryRaw<{ day: Date; n: bigint }[]>`
          SELECT day, count(*) AS n FROM user_activity_days
          WHERE day > ${dayKey(since)}::DATE GROUP BY day ORDER BY day`,
        p.$queryRaw<{ day: Date; n: bigint }[]>`
          SELECT created_at::DATE AS day, count(*) AS n FROM users
          WHERE created_at > ${since} AND deleted_at IS NULL
            AND role IN ('client', 'attorney')
          GROUP BY 1 ORDER BY 1`,
        p.$queryRaw<{ dau: bigint; wau: bigint; mau: bigint }[]>`
          SELECT
            count(DISTINCT user_id) FILTER (WHERE day >= ${today}::DATE - 0) AS dau,
            count(DISTINCT user_id) FILTER (WHERE day >= ${today}::DATE - 6) AS wau,
            count(DISTINCT user_id) FILTER (WHERE day >= ${today}::DATE - 29) AS mau
          FROM user_activity_days WHERE day >= ${today}::DATE - 29`,
        p.$queryRaw<
          {
            signed: bigint;
            verified: bigint;
            role: bigint;
            onboarded: bigint;
            first_action: bigint;
            paid: bigint;
          }[]
        >`
          WITH c AS (
            SELECT u.id, u.role, u.phone_verified_at, u.email_verified_at
            FROM users u
            WHERE u.created_at > ${since} AND u.deleted_at IS NULL
              AND u.role IS NOT NULL
          )
          SELECT
            (SELECT count(*) FROM users WHERE created_at > ${since} AND deleted_at IS NULL) AS signed,
            count(*) FILTER (WHERE phone_verified_at IS NOT NULL OR email_verified_at IS NOT NULL) AS verified,
            count(*) AS role,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM onboarding_state o
              WHERE o.user_id = c.id AND o.completed_at IS NOT NULL)) AS onboarded,
            count(*) FILTER (WHERE
              (c.role = 'client' AND EXISTS (SELECT 1 FROM cases k WHERE k.client_id = c.id))
              OR (c.role = 'attorney' AND EXISTS (SELECT 1 FROM bids b WHERE b.attorney_id = c.id))) AS first_action,
            count(*) FILTER (WHERE
              EXISTS (SELECT 1 FROM payments pm WHERE pm.user_id = c.id AND pm.status = 'succeeded')
              OR EXISTS (SELECT 1 FROM case_promotions cp WHERE cp.user_id = c.id
                AND cp.status IN ('active','finished','paused','pending_review') AND cp.granted_by IS NULL)) AS paid
          FROM c`,
        // Of the people who joined 7–14 days ago, how many came back on
        // day 1+ and on day 7+ after joining.
        p.$queryRaw<{ cohort: bigint; d1: bigint; d7: bigint }[]>`
          SELECT count(*) AS cohort,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM user_activity_days a
              WHERE a.user_id = u.id AND a.day >= u.created_at::DATE + 1)) AS d1,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM user_activity_days a
              WHERE a.user_id = u.id AND a.day >= u.created_at::DATE + 7)) AS d7
          FROM users u
          WHERE u.created_at >= now() - interval '14 days'
            AND u.created_at < now() - interval '7 days'
            AND u.deleted_at IS NULL AND u.role IN ('client', 'attorney')`,
        // Came in the 30 days before the last 30 and not since.
        p.$queryRaw<{ role: string; before: bigint; lost: bigint }[]>`
          SELECT u.role::TEXT AS role, count(*) AS before,
            count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM user_activity_days r
              WHERE r.user_id = u.id AND r.day >= ${today}::DATE - 29)) AS lost
          FROM users u
          WHERE u.deleted_at IS NULL AND u.role IN ('client', 'attorney')
            AND EXISTS (SELECT 1 FROM user_activity_days b WHERE b.user_id = u.id
              AND b.day BETWEEN ${today}::DATE - 59 AND ${today}::DATE - 30)
          GROUP BY u.role`,
        p.$queryRaw<{ day: Date; kind: string; n: bigint; cents: bigint }[]>`
          SELECT paid_at::DATE AS day, 'subscription' AS kind, count(*) AS n,
                 coalesce(sum(amount_cents), 0) AS cents
          FROM payments WHERE status = 'succeeded' AND paid_at > ${since}
          GROUP BY 1
          UNION ALL
          SELECT created_at::DATE, 'boost', count(*), coalesce(sum(total_cents), 0)
          FROM case_promotions
          WHERE created_at > ${since} AND granted_by IS NULL
            AND status IN ('active','finished','paused','pending_review')
          GROUP BY 1
          ORDER BY 1`,
      ]);

    const actByDay = new Map(series.map((r) => [dayKey(r.day), Number(r.n)]));
    const newByDay = new Map(signups.map((r) => [dayKey(r.day), Number(r.n)]));
    const buyByDay = new Map<
      string,
      { sub: number; boost: number; subN: number; boostN: number }
    >();
    for (const r of buys) {
      const k = dayKey(r.day);
      const cur = buyByDay.get(k) ?? { sub: 0, boost: 0, subN: 0, boostN: 0 };
      if (r.kind === 'subscription') {
        cur.sub += Number(r.cents);
        cur.subN += Number(r.n);
      } else {
        cur.boost += Number(r.cents);
        cur.boostN += Number(r.n);
      }
      buyByDay.set(k, cur);
    }
    const daily: AnalyticsDto['daily'] = [];
    for (let i = days - 1; i >= 0; i--) {
      const k = dayKey(new Date(now.getTime() - i * DAY_MS));
      const b = buyByDay.get(k);
      daily.push({
        day: k,
        active: actByDay.get(k) ?? 0,
        signups: newByDay.get(k) ?? 0,
        subscriptionCents: b?.sub ?? 0,
        boostCents: b?.boost ?? 0,
        purchases: (b?.subN ?? 0) + (b?.boostN ?? 0),
      });
    }

    const a = actives[0];
    const dau = Number(a?.dau ?? 0);
    const mau = Number(a?.mau ?? 0);
    const f = funnel[0];
    const steps = [
      ['signed_up', Number(f?.signed ?? 0)],
      ['verified', Number(f?.verified ?? 0)],
      ['role_chosen', Number(f?.role ?? 0)],
      ['onboarded', Number(f?.onboarded ?? 0)],
      ['first_action', Number(f?.first_action ?? 0)],
      ['paid', Number(f?.paid ?? 0)],
    ] as const;
    const r = retention[0];
    const cohort = Number(r?.cohort ?? 0);
    const byRole = (role: string) => {
      const row = churn.find((c) => c.role === role);
      return { before: Number(row?.before ?? 0), lost: Number(row?.lost ?? 0) };
    };
    return {
      days,
      dau,
      wau: Number(a?.wau ?? 0),
      mau,
      stickinessPercent: mau > 0 ? Math.round((dau / mau) * 100) : 0,
      funnel: steps.map(([key, count]) => ({ key, count })),
      retention: {
        cohort,
        d1Percent: cohort > 0 ? Math.round((Number(r.d1) / cohort) * 100) : 0,
        d7Percent: cohort > 0 ? Math.round((Number(r.d7) / cohort) * 100) : 0,
      },
      churn: { clients: byRole('client'), attorneys: byRole('attorney') },
      daily,
      events,
    };
  }
}
