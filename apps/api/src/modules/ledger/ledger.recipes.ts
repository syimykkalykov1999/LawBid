import type { AccountRef } from './ledger.chart';

/**
 * Pure builders of ledger lines for each money event (no database). Every
 * recipe returns lines whose debits equal credits; `ledger.recipes.spec.ts`
 * checks that for many amounts. Amounts are integer cents.
 */
export type Direction = 'debit' | 'credit';

export interface Line {
  account: AccountRef;
  direction: Direction;
  cents: number;
}

const dr = (account: AccountRef, cents: number): Line => ({
  account,
  direction: 'debit',
  cents,
});
const cr = (account: AccountRef, cents: number): Line => ({
  account,
  direction: 'credit',
  cents,
});
const nonZero = (lines: Line[]): Line[] => lines.filter((l) => l.cents > 0);

const BALANCE: AccountRef = { code: 'stripe_platform_balance' };

export type PlatformRevenue =
  | 'revenue_subscriptions'
  | 'revenue_bid_packs'
  | 'revenue_promotions'
  | 'stars_outstanding';

/**
 * The platform's own Stripe charge (subscription invoice, bid pack, stars
 * top-up, promotion): the gross lands in the Stripe balance; the tax inside
 * it is owed to the tax authority; the rest is revenue (or, for stars,
 * prepaid money still owed as stars).
 */
export function platformChargeLines(input: {
  grossCents: number;
  taxCents: number;
  target: PlatformRevenue;
}): Line[] {
  const tax = Math.min(Math.max(input.taxCents, 0), input.grossCents);
  return nonZero([
    dr(BALANCE, input.grossCents),
    cr({ code: input.target }, input.grossCents - tax),
    cr({ code: 'tax_payable' }, tax),
  ]);
}

/**
 * Money back on a platform charge: the reverse of the original lines,
 * scaled to `refundCents / grossCents`. Rounding is settled on the first
 * line of each side, so the reversal always balances and a full refund
 * reverses the original exactly.
 */
export function reverseProportional(
  original: readonly Line[],
  refundCents: number,
  grossCents: number,
): Line[] {
  if (grossCents <= 0 || refundCents <= 0) return [];
  const out: Line[] = [];
  for (const side of ['debit', 'credit'] as const) {
    const src = original.filter((l) => l.direction === side);
    const shares = src.map((l) =>
      refundCents >= grossCents
        ? l.cents
        : Math.floor((l.cents * refundCents) / grossCents),
    );
    const total = Math.min(refundCents, grossCents);
    const rest = total - shares.reduce((s, x) => s + x, 0);
    if (shares.length > 0) shares[0] += rest;
    src.forEach((l, i) =>
      out.push({
        account: l.account,
        direction: side === 'debit' ? 'credit' : 'debit',
        cents: shares[i],
      }),
    );
  }
  return nonZero(out);
}

export interface CasePaymentAmounts {
  attorneyId: string;
  /** What the client paid in total (card). */
  clientTotalCents: number;
  /** The platform's application fee. */
  platformFeeCents: number;
  /** What the attorney keeps (before Stripe's real fee, which is estimated). */
  attorneyNetCents: number;
}

/**
 * A client pays an attorney through Stripe Connect (direct charge with an
 * application fee). Only the fee reaches the platform's Stripe balance; the
 * rest lands in the attorney's own connected account, minus Stripe's cut.
 *   processing = total - fee - net   (what is neither ours nor theirs)
 */
export function casePaymentLines(a: CasePaymentAmounts): Line[] {
  const fee = a.platformFeeCents;
  const processing = Math.max(a.clientTotalCents - fee - a.attorneyNetCents, 0);
  // If rounding ever made net + fee exceed the total, the attorney line
  // absorbs it so the entry still balances.
  const net = a.clientTotalCents - fee - processing;
  return nonZero([
    dr({ code: 'external_card_payments' }, a.clientTotalCents - fee),
    dr(BALANCE, fee),
    cr({ code: 'revenue_case_fees' }, fee),
    cr({ code: 'connect_attorney', ownerId: a.attorneyId }, net),
    cr({ code: 'external_stripe_processing' }, processing),
  ]);
}

/**
 * Part of a case payment goes back to the card (`refundApplicationFee`
 * true = the platform returns its share of the fee, proportionally; a lost
 * chargeback leaves the fee with the platform and takes all from the
 * attorney).
 */
export function casePaymentRefundLines(input: {
  attorneyId: string;
  refundCents: number;
  clientTotalCents: number;
  platformFeeCents: number;
  refundApplicationFee: boolean;
}): Line[] {
  const { refundCents, clientTotalCents, platformFeeCents } = input;
  const feeBack = input.refundApplicationFee
    ? Math.min(
        platformFeeCents,
        Math.round((platformFeeCents * refundCents) / clientTotalCents),
      )
    : 0;
  return nonZero([
    dr(
      { code: 'connect_attorney', ownerId: input.attorneyId },
      refundCents - feeBack,
    ),
    dr({ code: 'revenue_case_fees' }, feeBack),
    cr(BALANCE, feeBack),
    cr({ code: 'external_card_payments' }, refundCents - feeBack),
  ]);
}

/** Stripe's own fee on a balance transaction, found by the nightly sync. */
export function stripeFeeLines(feeCents: number): Line[] {
  return nonZero([
    dr({ code: 'stripe_fees' }, feeCents),
    cr(BALANCE, feeCents),
  ]);
}

/** Money paid out to the owner's bank. */
export function bankPayoutLines(cents: number): Line[] {
  return nonZero([dr({ code: 'bank' }, cents), cr(BALANCE, cents)]);
}

/** A Stripe movement nobody classified yet (positive = into our balance). */
export function suspenseLines(signedCents: number): Line[] {
  return signedCents >= 0
    ? nonZero([dr(BALANCE, signedCents), cr({ code: 'suspense' }, signedCents)])
    : nonZero([
        dr({ code: 'suspense' }, -signedCents),
        cr(BALANCE, -signedCents),
      ]);
}

/** Cash paid out by the platform for a cost (staff pay, partner commission). */
export function expensePaidLines(
  expense: 'expense_payroll' | 'expense_partner_commission',
  cents: number,
): Line[] {
  return nonZero([dr({ code: expense }, cents), cr(BALANCE, cents)]);
}

export function isBalanced(lines: readonly Line[]): boolean {
  let d = 0;
  let c = 0;
  for (const l of lines) {
    if (l.direction === 'debit') d += l.cents;
    else c += l.cents;
  }
  return lines.length >= 2 && d === c;
}
