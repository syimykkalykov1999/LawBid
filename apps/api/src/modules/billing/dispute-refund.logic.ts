/**
 * R-237 (owner 2026-11-05): the pure rules of the automatic refund of a bank
 * inquiry. No database, no Stripe: everything here is unit-tested.
 */

/** What a bank inquiry awaiting our answer is called by Stripe. Evidence that
 * was already sent (`warning_under_review`) means we chose to contest it. */
export const REFUNDABLE_INQUIRY_STATUS = 'warning_needs_response';

/** Stripe: "You can't issue a refund outside the dispute process while the
 * dispute is open": a chargeback already took the money, so only an inquiry
 * that Stripe itself reports as refundable may be refunded. */
export function inquiryRefundable(input: {
  status: string;
  chargeRefundable: boolean;
}): boolean {
  return input.status === REFUNDABLE_INQUIRY_STATUS && input.chargeRefundable;
}

export type DisputeRefundHold =
  'fraud_review' | 'prior_dispute' | 'over_amount' | 'user_limit' | 'daily_cap';

/**
 * The anti-abuse limits in order: the first one that forbids an AUTOMATIC
 * refund (a person decides), or null when the refund may go out now.
 */
export function disputeRefundGuard(input: {
  fraudReview: boolean;
  priorDisputes: number;
  refundCents: number;
  maxCents: number;
  /** This user's automatic refunds inside the window, this one not counted. */
  userRefunds: number;
  userLimit: number;
  /** Already refunded automatically today (all users), cents. */
  refundedTodayCents: number;
  dailyCapCents: number;
}): DisputeRefundHold | null {
  if (input.fraudReview) return 'fraud_review';
  if (input.priorDisputes > 0) return 'prior_dispute';
  if (input.refundCents > Math.max(0, input.maxCents)) return 'over_amount';
  if (input.userRefunds >= Math.max(0, input.userLimit)) return 'user_limit';
  if (
    input.refundedTodayCents + input.refundCents >
    Math.max(0, input.dailyCapCents)
  ) {
    return 'daily_cap';
  }
  return null;
}

/** The Stripe key: one refund per dispute, whatever repeats. */
export function disputeRefundKey(disputeId: string): string {
  return `dispute:${disputeId}:refund`;
}

/** The reason on the Refund row, which also finds it again after a crash. */
export function disputeRefundReason(disputeId: string): string {
  return `dispute_auto:${disputeId}`;
}

/**
 * R-237, sweep B-c3 (2026-11-09): a «disputed» subscription without a bank
 * — the attorney cancels soon after the FIRST charge. Refundable by itself
 * only while it is the one and only successful charge and it is younger
 * than `billing.first_charge_refund_days` (0 = the rule is off). The same
 * anti-abuse guard above (fraud review, prior disputes, amount, one per user
 * per window, daily cap) then decides between the money and a person.
 * Pattern: Google Play's 48-hour / Apple's «request a refund» windows.
 */
export function firstChargeRefundable(input: {
  now: Date;
  windowDays: number;
  succeededPayments: number;
  firstChargeAt: Date | null;
}): boolean {
  if (!(input.windowDays > 0) || input.succeededPayments !== 1) return false;
  if (!input.firstChargeAt) return false;
  const age = input.now.getTime() - input.firstChargeAt.getTime();
  return age >= 0 && age <= input.windowDays * 86_400_000;
}

/** The `dispute_id` of such a row: there is no dispute, so the payment. */
export function firstChargeCancelRef(paymentId: string): string {
  return `cancel:${paymentId}`;
}

export function isFirstChargeCancelRef(ref: string): boolean {
  return ref.startsWith('cancel:');
}
