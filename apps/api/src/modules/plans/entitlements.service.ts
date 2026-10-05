import { Inject, Injectable } from '@nestjs/common';
import { type Plan, Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { SEATS_HARD_CAP } from '../billing/billing.constants';
import { clientBadgeActive } from '../client-badge/client-badge.util';
import {
  findActiveGrant,
  paidSeats,
} from '../subscriptions/contract-grant.util';
import { subscriptionRowIsActive } from '../subscriptions/subscription-rules';
import {
  type Audience,
  type EntitlementKey,
  type Entitlements,
  entitlementBool,
  entitlementNumber,
  mergeEntitlements,
  sanitizeEntitlements,
} from './entitlement-catalog';
import {
  BUILTIN_PLAN_CODES,
  highlights,
  type LocalizedText,
  PlansService,
  text,
} from './plans.service';

export type EntitlementSource = 'baseline' | 'plan' | 'legacy' | 'grant';

export interface SeatSummary {
  /** Seats that come with the plan. */
  included: number;
  /** Extra seats bought on top. */
  extra: number;
  /** included + extra (or the contract grant's seats when larger). */
  total: number;
  /** Most seats this plan allows in total. */
  max: number;
}

export interface ResolvedEntitlements {
  audience: Audience;
  source: EntitlementSource;
  planId: string | null;
  planCode: string | null;
  planName: LocalizedText;
  planHighlights: LocalizedText[];
  /** An active paid subscription (or a contract grant) stands. */
  isPaid: boolean;
  values: Entitlements;
  seats: SeatSummary | null;
}

export const CLIENT_LIVE_STATUSES = ['trialing', 'active', 'past_due'];
const CACHE_TTL_SECONDS = 60;
const VERSION_KEY = 'ent:ver';
const cacheKey = (ver: string, userId: string) => `ent:${ver}:${userId}`;

/**
 * Owner 2026-10-05 (plan builder): THE gate for "what does this user get".
 * Every check in the code — seats, offers in any state, offer and case
 * limits, search rank, cases first in the feed, the client badge, video
 * calls, templates — asks this service; nothing reads a plan constant.
 *
 * Resolution: an active subscription's frozen snapshot (its terms at
 * purchase) → else the plan it points to → else, for a row bought before
 * plans existed, the audience's default plan of that interval → else the
 * audience's baseline plan (what "no subscription" gets). A client's old
 * badge subscription still counts as `verified_badge`.
 *
 * Cached in Redis for 60 s per user; a change to any plan bumps a global
 * version so every cached answer is dropped at once.
 */
@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async forUser(userId: string): Promise<ResolvedEntitlements> {
    const ver = await this.version();
    const key = cacheKey(ver, userId);
    const cached = await this.redis.get(key).catch(() => null);
    if (cached) {
      try {
        return JSON.parse(cached) as ResolvedEntitlements;
      } catch {
        /* fall through */
      }
    }
    const resolved = await this.compute(userId);
    await this.redis
      .set(key, JSON.stringify(resolved), 'EX', CACHE_TTL_SECONDS)
      .catch(() => undefined);
    return resolved;
  }

  async has(userId: string, key: EntitlementKey): Promise<boolean> {
    return entitlementBool((await this.forUser(userId)).values, key);
  }

  /** A numeric limit; 0 = unlimited for the catalog's "zeroIsUnlimited" keys. */
  async limit(userId: string, key: EntitlementKey): Promise<number> {
    return entitlementNumber((await this.forUser(userId)).values, key);
  }

  /** Attorney seats (included + extra, or the grant's). */
  async seats(userId: string): Promise<SeatSummary> {
    return (
      (await this.forUser(userId)).seats ?? {
        included: 0,
        extra: 0,
        total: 0,
        max: 0,
      }
    );
  }

  /** The user's subscription changed. */
  async invalidateUser(userId: string): Promise<void> {
    const ver = await this.version();
    await this.redis.del(cacheKey(ver, userId)).catch(() => undefined);
  }

  /** A plan changed: every cached answer is stale. */
  async invalidateAll(): Promise<void> {
    this.plans.invalidate();
    await this.redis.incr(VERSION_KEY).catch(() => undefined);
  }

  /** Attorney: the entitlements the plan [plan] gives, with the seats a
   * subscription with [extraSeats] has; with [attorneyId], that attorney's
   * personal limit from the admin counts too. Used by checkout quotes. */
  async forPlan(
    plan: Plan,
    extraSeats = 0,
    attorneyId?: string,
  ): Promise<{ values: Entitlements; seats: SeatSummary }> {
    const audience = plan.audience as Audience;
    const values = mergeEntitlements(
      audience,
      await this.plans.baselineEntitlements(audience),
      this.plans.entitlementsOf(plan),
    );
    const own = attorneyId
      ? ((
          await this.prisma.attorneyProfile.findUnique({
            where: { user_id: attorneyId },
            select: { assistant_seat_limit: true },
          })
        )?.assistant_seat_limit ?? null)
      : null;
    return { values, seats: seatsOf(values, extraSeats, own) };
  }

  private async version(): Promise<string> {
    return (await this.redis.get(VERSION_KEY).catch(() => null)) ?? '0';
  }

  private async compute(userId: string): Promise<ResolvedEntitlements> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (user?.role === 'client') return this.computeClient(userId);
    return this.computeAttorney(userId);
  }

  private async computeAttorney(userId: string): Promise<ResolvedEntitlements> {
    const audience: Audience = 'attorney';
    const baseline = await this.plans.baselineEntitlements(audience);
    const [sub, grant, profile] = await Promise.all([
      this.prisma.subscription.findUnique({
        where: { user_id: userId },
        select: {
          status: true,
          grace_ends_at: true,
          plan: true,
          assistant_seats: true,
          plan_id: true,
          entitlements: true,
        },
      }),
      findActiveGrant(this.prisma, userId),
      this.prisma.attorneyProfile.findUnique({
        where: { user_id: userId },
        select: { assistant_seat_limit: true },
      }),
    ]);
    // Owner 2026-10-05: an admin's personal limit (seat request approved
    // or set on Teams) replaces the plan's `max_seats` for this attorney.
    const own = profile?.assistant_seat_limit ?? null;
    const present = (
      source: EntitlementSource,
      plan: Plan | null,
      values: Entitlements,
      seats: SeatSummary,
      isPaid: boolean,
    ) =>
      presentResolved(
        audience,
        source,
        plan,
        values,
        withPersonalLimit(seats, own),
        isPaid,
      );
    const active = subscriptionRowIsActive(sub);
    if (active && sub) {
      const plan = sub.plan_id ? await this.safePlan(sub.plan_id) : null;
      const snapshot = sub.entitlements
        ? sanitizeEntitlements(audience, sub.entitlements)
        : null;
      if (plan || snapshot) {
        const values = mergeEntitlements(
          audience,
          baseline,
          plan ? this.plans.entitlementsOf(plan) : null,
          snapshot,
        );
        const seats = seatsOf(values, sub.assistant_seats, own);
        if (grant) seats.total = Math.max(seats.total, grant.assistant_seats);
        return present('plan', plan, values, seats, true);
      }
      // A row from before plans existed: the audience's default plan of
      // its interval; the seats it bought are what it has.
      const legacy = await this.plans.defaultFor(
        audience,
        sub.plan === 'yearly' ? 'year' : 'month',
      );
      const values = mergeEntitlements(
        audience,
        baseline,
        legacy ? this.plans.entitlementsOf(legacy) : null,
      );
      const yearlySeats = entitlementNumber(values, 'included_seats');
      const total = Math.max(
        paidSeats(sub, yearlySeats),
        grant?.assistant_seats ?? 0,
      );
      const seats: SeatSummary = {
        included: sub.plan === 'yearly' ? paidSeats(sub, yearlySeats) : 0,
        extra: sub.plan === 'yearly' ? 0 : sub.assistant_seats,
        total,
        max: Math.max(total, entitlementNumber(values, 'max_seats')),
      };
      return present('legacy', legacy, values, seats, true);
    }
    if (grant) {
      // Owner 2026-10-02: a free subscription under a contract = the
      // yearly default plan with the grant's seats.
      const plan = await this.plans.defaultFor(audience, 'year');
      const values = mergeEntitlements(
        audience,
        baseline,
        plan ? this.plans.entitlementsOf(plan) : null,
      );
      const seats: SeatSummary = {
        included: grant.assistant_seats,
        extra: 0,
        total: grant.assistant_seats,
        max: Math.max(
          grant.assistant_seats,
          entitlementNumber(values, 'max_seats'),
        ),
      };
      return present('grant', plan, values, seats, true);
    }
    const plan = await this.plans.baseline(audience);
    return present(
      'baseline',
      plan,
      baseline,
      seatsOf(baseline, 0, own),
      false,
    );
  }

  private async computeClient(userId: string): Promise<ResolvedEntitlements> {
    const audience: Audience = 'client';
    const baseline = await this.plans.baselineEntitlements(audience);
    const [sub, badge] = await Promise.all([
      this.prisma.clientSubscription.findUnique({
        where: { user_id: userId },
        select: {
          status: true,
          current_period_end: true,
          plan_id: true,
          entitlements: true,
        },
      }),
      this.prisma.clientVerification
        .findUnique({
          where: { user_id: userId },
          select: { status: true, sub_status: true, current_period_end: true },
        })
        .catch(() => null),
    ]);
    const legacyBadge = clientBadgeActive(badge);
    if (sub && clientSubscriptionActive(sub)) {
      const plan = sub.plan_id ? await this.safePlan(sub.plan_id) : null;
      const values = mergeEntitlements(
        audience,
        baseline,
        plan ? this.plans.entitlementsOf(plan) : null,
        sub.entitlements
          ? sanitizeEntitlements(audience, sub.entitlements)
          : null,
      );
      if (legacyBadge) values.verified_badge = true;
      return presentResolved(audience, 'plan', plan, values, null, true);
    }
    const plan = await this.plans.baseline(audience);
    const values = { ...baseline };
    if (legacyBadge) values.verified_badge = true;
    return presentResolved(
      audience,
      'baseline',
      plan,
      values,
      null,
      legacyBadge,
    );
  }

  private async safePlan(id: string): Promise<Plan | null> {
    try {
      return await this.plans.byId(id);
    } catch {
      return null;
    }
  }
}

/** docs/06 §1.2 rule, applied to a client's plan row. */
export function clientSubscriptionActive(
  row: { status: string; current_period_end: Date | null } | null,
  now = new Date(),
): boolean {
  if (!row) return false;
  if (row.status === 'trialing' || row.status === 'active') return true;
  if (row.status === 'past_due') return true;
  return (
    row.status === 'canceled' &&
    row.current_period_end !== null &&
    row.current_period_end > now
  );
}

/** The plan's seats with [extra] bought; [own] = an admin's personal
 * limit for this attorney, which replaces the plan's `max_seats`. */
export function seatsOf(
  values: Entitlements,
  extra: number,
  own: number | null = null,
): SeatSummary {
  const included = entitlementNumber(values, 'included_seats');
  const planMax = Math.max(included, entitlementNumber(values, 'max_seats'));
  const max =
    own != null && own > 0
      ? Math.min(SEATS_HARD_CAP, Math.max(included, own))
      : planMax;
  const safeExtra = Math.max(0, Math.min(extra, max - included));
  return { included, extra: safeExtra, total: included + safeExtra, max };
}

/** The admin's personal limit for one attorney wins over the plan's cap
 * (never below the seats the plan includes; within the hard cap). */
export function withPersonalLimit(
  seats: SeatSummary,
  own: number | null,
): SeatSummary {
  if (own == null || own <= 0) return seats;
  const max = Math.min(SEATS_HARD_CAP, Math.max(seats.included, own));
  const extra = Math.max(0, Math.min(seats.extra, max - seats.included));
  return {
    ...seats,
    extra,
    total: Math.max(seats.included + extra, seats.total),
    max,
  };
}

function presentResolved(
  audience: Audience,
  source: EntitlementSource,
  plan: Plan | null,
  values: Entitlements,
  seats: SeatSummary | null,
  isPaid: boolean,
): ResolvedEntitlements {
  return {
    audience,
    source,
    planId: plan?.id ?? null,
    planCode: plan?.code ?? null,
    planName: plan ? text(plan.name) : {},
    planHighlights: plan ? highlights(plan.highlights) : [],
    isPaid,
    values,
    seats,
  };
}

/** SQL fragment: clients whose live plan carries [key] = true (the frozen
 * snapshot wins over the plan). For the feed's "cases first" slot. */
export function clientsWithEntitlementSql(
  key: EntitlementKey,
  clientIdColumn: Prisma.Sql,
): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM client_subscriptions cs
    LEFT JOIN plans p ON p.id = cs.plan_id
    WHERE cs.user_id = ${clientIdColumn}
      AND (cs.status IN ('trialing', 'active', 'past_due')
           OR (cs.status = 'canceled' AND cs.current_period_end > now()))
      AND COALESCE((cs.entitlements->>${key})::BOOL, (p.entitlements->>${key})::BOOL, false))`;
}

/** SQL fragment: attorneys whose live subscription carries [key] = true
 * (snapshot wins over the plan; a pre-plan row falls back to the default
 * plan of its interval). For search ranking. */
export function attorneysWithEntitlementSql(
  key: EntitlementKey,
  attorneyIdColumn: Prisma.Sql,
): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM subscriptions s
    LEFT JOIN plans p ON p.id = s.plan_id
    LEFT JOIN plans d ON s.plan_id IS NULL AND d.audience = 'attorney'
      AND d.kind = 'paid' AND d.is_default
      AND d.interval = CASE WHEN s.plan = 'yearly' THEN 'year' ELSE 'month' END
    WHERE s.user_id = ${attorneyIdColumn}
      AND (s.status IN ('trialing', 'active')
           OR (s.status = 'past_due' AND s.grace_ends_at > now()))
      AND COALESCE((s.entitlements->>${key})::BOOL, (p.entitlements->>${key})::BOOL,
                   (d.entitlements->>${key})::BOOL, false))`;
}

export { BUILTIN_PLAN_CODES };
