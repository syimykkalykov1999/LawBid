/**
 * Algo audit M-4 (owner 2026-10-28): the pure rules of the duplicate
 * subscription auto-fix — which subscription stays, how much of the other
 * one may go back, and which guard stops the automatic refund. No database,
 * no Stripe: everything here is unit-tested
 * (duplicate-subscriptions.logic.spec.ts).
 */

/** Stripe states in which a subscription still bills (or will retry). */
export const LIVE_SUBSCRIPTION_STATUSES: readonly string[] = [
  'active',
  'trialing',
  'past_due',
];

/** Subscriptions of a customer that are not the attorney's plan. */
export const NON_ATTORNEY_SUBSCRIPTION_KINDS: readonly string[] = [
  'client_badge',
  'client_plan',
];

/** The Nth duplicate within this window stops the automation. */
export const DUPLICATE_WINDOW_DAYS = 90;
/** Auto-fixes allowed per attorney inside the window (the next one is
 * held for the owner: "N > 2 → stop auto"). */
export const MAX_AUTO_FIXES_PER_WINDOW = 2;

/** One subscription as the auto-fix sees it. */
export interface DuplicateCandidate {
  id: string;
  customerId: string;
  status: string;
  /** Unix seconds (null on old fakes). */
  created: number | null;
  currentPeriodStart: number | null;
  currentPeriodEnd: number | null;
  metadata: Record<string, string>;
  /** Its latest invoice when that invoice is PAID with money (> 0) and
   * belongs to this very subscription; null otherwise. */
  lastPaid: {
    invoiceId: string;
    amountCents: number;
    paidAt: number | null;
    paymentIntentId: string | null;
    currency: string;
  } | null;
}

/**
 * Which of the customer's subscriptions are the attorney's own live plan
 * subscriptions: same customer as the attorney's Stripe customer (never
 * another account), metadata userId absent or equal to the attorney, not a
 * client badge / client plan, still billing.
 */
export function attorneyLiveSubscriptions<T extends DuplicateCandidate>(
  all: readonly T[],
  opts: { userId: string; customerId: string },
): T[] {
  return all.filter(
    (s) =>
      s.customerId === opts.customerId &&
      (!s.metadata.userId || s.metadata.userId === opts.userId) &&
      !NON_ATTORNEY_SUBSCRIPTION_KINDS.includes(s.metadata.kind ?? '') &&
      LIVE_SUBSCRIPTION_STATUSES.includes(s.status),
  );
}

const statusRank = (s: string): number =>
  s === 'active' ? 0 : s === 'trialing' ? 1 : 2;

/**
 * The ONE subscription that stays: the newest successfully paid one — a
 * healthy subscription (active / trialing) always beats a past_due one (the
 * attorney is never left on a failing card); among those, a paid one beats
 * an unpaid one, then the paid period that ends last, the latest payment,
 * the newest created. Deterministic (ties by id) so two workers agree.
 */
export function pickKeeper<T extends DuplicateCandidate>(
  cands: readonly T[],
): T | null {
  if (cands.length === 0) return null;
  const healthy = cands.filter(
    (c) => c.status === 'active' || c.status === 'trialing',
  );
  const pool = healthy.length > 0 ? healthy : [...cands];
  const sorted = [...pool].sort((a, b) => {
    const paid = (b.lastPaid ? 1 : 0) - (a.lastPaid ? 1 : 0);
    if (paid !== 0) return paid;
    const r = statusRank(a.status) - statusRank(b.status);
    if (r !== 0) return r;
    const end = (b.currentPeriodEnd ?? 0) - (a.currentPeriodEnd ?? 0);
    if (end !== 0) return end;
    const paidAt = (b.lastPaid?.paidAt ?? 0) - (a.lastPaid?.paidAt ?? 0);
    if (paidAt !== 0) return paidAt;
    const created = (b.created ?? 0) - (a.created ?? 0);
    if (created !== 0) return created;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return sorted[0];
}

export type NoRefundReason =
  'no_charge' | 'period_over' | 'no_overlap' | 'already_refunded';

/**
 * The unused remainder of the duplicate's LAST paid invoice: its share of
 * the paid period still ahead, never above what that invoice charged minus
 * what was already refunded on it, never negative. A duplicate that never
 * charged for the period it shares with the kept subscription (a stale
 * subscription left behind by a re-subscription after grace) gets nothing.
 */
export function duplicateRefundCents(input: {
  chargedCents: number;
  alreadyRefundedCents: number;
  periodStart: number | null;
  periodEnd: number | null;
  /** The kept subscription's period start (unix seconds). */
  keeperPeriodStart: number | null;
  nowSec: number;
}): { cents: number; reason: NoRefundReason | null } {
  const charged = Math.max(0, Math.floor(input.chargedCents));
  if (charged <= 0) return { cents: 0, reason: 'no_charge' };
  const { periodStart: start, periodEnd: end, nowSec: now } = input;
  if (start === null || end === null || end <= start) {
    return { cents: 0, reason: 'no_charge' };
  }
  if (end <= now) return { cents: 0, reason: 'period_over' };
  if (input.keeperPeriodStart !== null && end <= input.keeperPeriodStart) {
    return { cents: 0, reason: 'no_overlap' };
  }
  const total = end - start;
  const left = Math.min(end - now, total);
  const share = Math.floor((charged * left) / total);
  const room = charged - Math.max(0, input.alreadyRefundedCents);
  const cents = Math.max(0, Math.min(share, room, charged));
  if (cents <= 0) {
    return { cents: 0, reason: room <= 0 ? 'already_refunded' : 'period_over' };
  }
  return { cents, reason: null };
}

export type GuardReason =
  'cross_account' | 'dispute' | 'fraud_review' | 'over_charge' | 'daily_cap';

/**
 * Anti-abuse guards in order. Returns the first reason that forbids an
 * AUTOMATIC refund (the cancel may still happen; a person decides on the
 * money), or null when the refund may go out now.
 */
export function refundGuard(input: {
  /** The paying user of the invoice is the attorney (no cross-account). */
  sameAccount: boolean;
  disputed: boolean;
  fraudReview: boolean;
  refundCents: number;
  chargedCents: number;
  /** Already refunded automatically today (all attorneys), cents. */
  refundedTodayCents: number;
  dailyCapCents: number;
}): GuardReason | null {
  if (!input.sameAccount) return 'cross_account';
  if (input.disputed) return 'dispute';
  if (input.fraudReview) return 'fraud_review';
  if (input.refundCents > input.chargedCents) return 'over_charge';
  if (
    input.refundedTodayCents + input.refundCents >
    Math.max(0, input.dailyCapCents)
  ) {
    return 'daily_cap';
  }
  return null;
}

/** "N > 2 → stop auto": the attorney already had this many auto-fixes in
 * the last 90 days, so this one is held for the owner. */
export function tooManyDuplicates(priorFixesInWindow: number): boolean {
  return priorFixesInWindow >= MAX_AUTO_FIXES_PER_WINDOW;
}

/** Stripe idempotency key for one action on one duplicate subscription. */
export function duplicateActionKey(
  subscriptionId: string,
  action: 'cancel' | 'refund',
): string {
  return `dupsub:${subscriptionId}:${action}`;
}

/** The refund row's reason (also how a retry finds it again). */
export function duplicateRefundReason(subscriptionId: string): string {
  return `Duplicate subscription ${subscriptionId}: unused remainder (auto)`;
}
