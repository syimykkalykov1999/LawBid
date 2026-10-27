/**
 * Staff package T7: the pure arithmetic of piecework pay (no I/O, no clock).
 *
 *   day amount of one kind = (units - overturned) x rate x quality coefficient
 *
 * - `units` are the decisions the person closed that day (work-lease `done`
 *   events, per kind);
 * - `overturned` are decisions a second look reversed (`staff_review_samples`
 *   done with verdict different / worse, by the day the verdict arrived):
 *   they are NOT paid, so they are taken off the same kind's units. Paid
 *   units of an earlier day that are overturned today therefore come back as
 *   a negative amount today (a reversal) instead of rewriting a paid day;
 * - the quality coefficient comes from the latest rating snapshot band
 *   (owner numbers `staff.piecework.mult_*_pct`: 90+ 110 %, 75-89 100 %,
 *   60-74 90 %, below 60 75 %); «мало данных» is always 1.00 and a missing
 *   snapshot is 1.00 too, but the day is marked «без рейтинга».
 */

/** The unit kinds a rate can be set for (plan table `staff_rates.kind`). */
export const PIECEWORK_RATE_KINDS = [
  'verification',
  'report',
  'ticket',
  'appeal',
  'media_report',
] as const;
export type PieceworkKind = (typeof PIECEWORK_RATE_KINDS)[number];

/** work_leases.kind / staff_review_samples.decision_kind → rate kind.
 * Kinds that are not here (refund, payout, trust case, review sample) are
 * not paid by the piece. */
const ITEM_KIND_TO_RATE: Readonly<Record<string, PieceworkKind>> = {
  verification: 'verification',
  report: 'report',
  support_ticket: 'ticket',
  media_report: 'media_report',
  mod_appeal: 'appeal',
  review_appeal: 'appeal',
};

export function rateKindOf(itemKind: string): PieceworkKind | null {
  return ITEM_KIND_TO_RATE[itemKind] ?? null;
}

/** The owner's four coefficients, in percent (100 = ×1.00). */
export interface QualityPercents {
  p90: number;
  p75: number;
  p60: number;
  low: number;
}

export interface QualityResult {
  /** Percent actually applied (110, 100, 90, 75 …). */
  pct: number;
  band: '90' | '75' | '60' | 'low' | 'low_data' | 'none';
  /** No rating snapshot at all for the day: shown as «без рейтинга». */
  noRating: boolean;
}

/**
 * Rating band → coefficient. [snapshot] is the latest snapshot at or before
 * the day, or null when there is none.
 */
export function qualityFor(
  snapshot: { rating: number | null; status: string } | null,
  p: QualityPercents,
): QualityResult {
  if (!snapshot) return { pct: 100, band: 'none', noRating: true };
  if (snapshot.rating === null || snapshot.status === 'low_data') {
    return { pct: 100, band: 'low_data', noRating: false };
  }
  const r = snapshot.rating;
  if (r >= 90) return { pct: p.p90, band: '90', noRating: false };
  if (r >= 75) return { pct: p.p75, band: '75', noRating: false };
  if (r >= 60) return { pct: p.p60, band: '60', noRating: false };
  return { pct: p.low, band: 'low', noRating: false };
}

export interface RateRow {
  kind: string;
  workspace: string;
  amount_cents: number;
  currency: string;
  valid_from: Date;
  valid_to: Date | null;
  boost_mult: { toString(): string } | number | null;
}

/** The rate in force at [at] for a kind in a workspace (latest start wins). */
export function pickRate<T extends RateRow>(
  rates: readonly T[],
  kind: string,
  workspace: string,
  at: Date,
): T | null {
  let best: T | null = null;
  for (const r of rates) {
    if (r.kind !== kind || r.workspace !== workspace) continue;
    if (r.valid_from.getTime() > at.getTime()) continue;
    if (r.valid_to && r.valid_to.getTime() <= at.getTime()) continue;
    if (!best || r.valid_from.getTime() > best.valid_from.getTime()) best = r;
  }
  return best;
}

/** Rate in cents after the weekly quest multiplier, capped by the owner's
 * ceiling `staff.piecework.boost_max_pct` (a multiplier below 1 is ignored). */
export function effectiveRateCents(
  rate: Pick<RateRow, 'amount_cents' | 'boost_mult'>,
  boostMaxPct: number,
): number {
  const raw = rate.boost_mult === null ? 1 : Number(rate.boost_mult);
  const boost = Math.min(Math.max(raw, 1), Math.max(boostMaxPct, 100) / 100);
  return Math.round(rate.amount_cents * boost);
}

/** (units - overturned) x rate x coefficient, whole cents; negative when more
 * was overturned than done that day. Integer maths on the percent. */
export function lineAmountCents(
  units: number,
  overturned: number,
  rateCents: number,
  qualityPct: number,
): number {
  return Math.round(((units - overturned) * rateCents * qualityPct) / 100);
}

export type DayStatus =
  'accrued' | 'no_rating' | 'reversed' | 'no_payroll' | 'disputed';

/** The status stored on a piecework day (the column is free text, 12). */
export function dayStatus(opts: {
  totalCents: number;
  noRating: boolean;
  onPayroll: boolean;
}): DayStatus {
  if (!opts.onPayroll) return 'no_payroll';
  if (opts.totalCents < 0) return 'reversed';
  if (opts.noRating) return 'no_rating';
  return 'accrued';
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDay(s: string): boolean {
  if (!DAY_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** [start, end) of a UTC calendar day. */
export function dayBounds(day: string): { start: Date; end: Date } {
  const start = new Date(`${day}T00:00:00.000Z`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

/** YYYY-MM-DD of the UTC day before [now]. */
export function yesterdayOf(now: Date): string {
  return new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
}

/** The payroll accrual reference of a day: one per person per day. */
export function accrualRef(adminId: string, day: string): string {
  return `staff_piecework:${adminId}:${day}`;
}

/** After a recount the old reference stays (canceled) and the new amount
 * goes under the next revision: `…:day` → `…:day:r2` → `…:day:r3`. */
export function nextAccrualRef(ref: string): string {
  const m = /^(.*):r(\d+)$/.exec(ref);
  return m ? `${m[1]}:r${Number(m[2]) + 1}` : `${ref}:r2`;
}
