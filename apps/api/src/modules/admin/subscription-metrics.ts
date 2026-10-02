import type { Prisma, SubscriptionPlan } from '@prisma/client';

/**
 * Audit 2026-10-02 — one definition of a "live" subscription for every
 * admin number (dashboard tiles and the extended overview), the same rule
 * as the gate (SubscriptionAccessService.rowIsActive):
 *  - `trialing` and `active` count;
 *  - `past_due` counts only while its grace period runs
 *    (grace_ends_at > now);
 *  - `canceled`, `incomplete`, `expired` never count.
 */
export function liveSubscriptionWhere(
  now: Date,
): Prisma.SubscriptionWhereInput {
  return {
    OR: [
      { status: { in: ['trialing', 'active'] } },
      { status: 'past_due', grace_ends_at: { gt: now } },
    ],
  };
}

/** Live AND paying: as above without `trialing` (no money yet). */
export function payingSubscriptionWhere(
  now: Date,
): Prisma.SubscriptionWhereInput {
  return {
    OR: [
      { status: 'active' },
      { status: 'past_due', grace_ends_at: { gt: now } },
    ],
  };
}

/**
 * Monthly recurring revenue in cents from per-plan sums of
 * `subscriptions.price_cents`: a monthly row's price already includes its
 * assistant seats (base + seats × seat price); a yearly row is spread
 * over 12 months.
 */
export function monthlyRevenueCents(
  sums: readonly { plan: SubscriptionPlan; priceCents: number }[],
): number {
  let total = 0;
  for (const s of sums) {
    total += s.plan === 'yearly' ? s.priceCents / 12 : s.priceCents;
  }
  return Math.round(total);
}
