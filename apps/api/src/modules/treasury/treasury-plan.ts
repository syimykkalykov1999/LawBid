/**
 * Owner 2026-10-05 «на карту — только чистая прибыль»: the pure arithmetic
 * of one month. Money comes into the platform's Stripe balance (Stripe
 * already took its fee). Once a month it is split three ways:
 *
 *   1. «Расходы» payout — what the services charge the expense card for a
 *      month (AWS, database, Twilio, Bunny, …) plus salaries / partner
 *      commissions that are paid from the bank (not through Stripe).
 *   2. Reserve kept on the Stripe balance — Stripe payroll transfers and
 *      partner commissions due, a refund buffer, and a safety cushion
 *      (`bufferPercent` of everything monthly) so one bad month never
 *      leaves a bill unpaid.
 *   3. «Прибыль» payout — everything above that, to the owner's bank.
 *
 * Expenses come first: if the balance is short, the expense account gets
 * what there is and the owner is told in plain words; profit is then 0.
 */

export interface PlanExpenseLine {
  name: string;
  monthlyCents: number;
}

export interface PlanInput {
  /** Stripe balance available for payout now (USD cents). */
  availableCents: number;
  /** Services paid by the expense card, a month each. */
  services: PlanExpenseLine[];
  /** Salaries a month: sent from the Stripe balance (Stripe payroll). */
  payrollStripeCents: number;
  /** Salaries a month: paid by bank / Zelle from the expense account. */
  payrollBankCents: number;
  /** Partner commissions and payroll bonuses owed but not paid yet. */
  owedCents: number;
  /** Owed money goes through Stripe (true) or the bank (false). */
  owedViaStripe: boolean;
  /** Kept on the balance for refunds and disputes. */
  refundBufferCents: number;
  /** Safety cushion, percent of everything monthly. */
  bufferPercent: number;
  /** Profit below this is left for the next month (no tiny payouts). */
  minProfitCents: number;
  /** This month's expense payout already went out. */
  expensesPaidThisPeriod: boolean;
}

export interface Plan {
  servicesCents: number;
  /** What the expense account needs a month. */
  expenseAllowanceCents: number;
  /** What must stay on the Stripe balance for Stripe-paid obligations. */
  stripeObligationsCents: number;
  cushionCents: number;
  /** Stays on Stripe after the run = obligations + cushion. */
  reserveTargetCents: number;
  /** Everything a month (expense allowance + Stripe obligations). */
  monthlyCostCents: number;
  /** Payout to «Расходы» on this run. */
  expensePayoutCents: number;
  /** Payout to «Прибыль» on this run. */
  profitPayoutCents: number;
  /** Profit that stays because it is below `minProfitCents`. */
  heldProfitCents: number;
  /** Missing to cover expenses + reserve (0 = all covered). */
  shortfallCents: number;
  /** How many months of costs stay on Stripe after the run. */
  coverMonths: number | null;
}

const nonNeg = (n: number): number =>
  Number.isFinite(n) && n > 0 ? Math.round(n) : 0;

export function computePlan(input: PlanInput): Plan {
  const available = nonNeg(input.availableCents);
  const servicesCents = input.services.reduce(
    (s, l) => s + nonNeg(l.monthlyCents),
    0,
  );
  const owed = nonNeg(input.owedCents);
  const expenseAllowanceCents =
    servicesCents +
    nonNeg(input.payrollBankCents) +
    (input.owedViaStripe ? 0 : owed);
  const stripeObligationsCents =
    nonNeg(input.payrollStripeCents) +
    (input.owedViaStripe ? owed : 0) +
    nonNeg(input.refundBufferCents);
  const monthlyCostCents = expenseAllowanceCents + stripeObligationsCents;
  const pct = Math.min(Math.max(input.bufferPercent, 0), 500);
  const cushionCents = Math.round((monthlyCostCents * pct) / 100);
  const reserveTargetCents = stripeObligationsCents + cushionCents;

  const expenseDue = input.expensesPaidThisPeriod ? 0 : expenseAllowanceCents;
  const expensePayoutCents = Math.min(expenseDue, available);
  const left = available - expensePayoutCents;
  const above = Math.max(0, left - reserveTargetCents);
  const minProfit = nonNeg(input.minProfitCents);
  const profitPayoutCents = above > 0 && above >= minProfit ? above : 0;
  const heldProfitCents = above - profitPayoutCents;
  const shortfallCents = Math.max(
    0,
    expenseDue + reserveTargetCents - available,
  );
  const kept = left - profitPayoutCents;
  const coverMonths =
    monthlyCostCents > 0
      ? Math.floor((kept / monthlyCostCents) * 10) / 10
      : null;

  return {
    servicesCents,
    expenseAllowanceCents,
    stripeObligationsCents,
    cushionCents,
    reserveTargetCents,
    monthlyCostCents,
    expensePayoutCents,
    profitPayoutCents,
    heldProfitCents,
    shortfallCents,
    coverMonths,
  };
}

/** `YYYY-MM` (UTC) a date belongs to. */
export function periodOf(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/** Payout day of the month `d` is in, UTC midnight (day clamped 1…28). */
export function payoutDateOf(d: Date, day: number): Date {
  const dd = Math.min(Math.max(Math.round(day), 1), 28);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), dd));
}

/** The monthly run is due: the payout day has come and this month's run
 * has not happened yet (a missed day runs on the next daily tick). */
export function runDue(
  now: Date,
  day: number,
  ranThisPeriod: boolean,
): boolean {
  return !ranThisPeriod && now >= payoutDateOf(now, day);
}

/** The date of the next monthly run (for the admin screen). */
export function nextRunDate(
  now: Date,
  day: number,
  ranThisPeriod: boolean,
): Date {
  if (!ranThisPeriod) {
    const d = payoutDateOf(now, day);
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    return d < today ? today : d;
  }
  return payoutDateOf(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
    day,
  );
}

/** Whole days from today (UTC) to `date` (0 on the day itself). */
export function daysUntil(now: Date, date: Date): number {
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Math.max(0, Math.round((date.getTime() - today) / 86_400_000));
}
