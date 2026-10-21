/** Owner 2026-10-20 (case tools): the arithmetic of time and expenses,
 * kept pure so every total on screen, in the PDF and in the tests is the
 * same number. Money is in cents, time in whole minutes. */

export const MAX_ENTRY_MINUTES = 24 * 60;

/** What [minutes] cost at [rateCents] an hour, to the cent. */
export const entryCents = (minutes: number, rateCents: number): number =>
  Math.round((minutes * rateCents) / 60);

/** A timer that ran from [since] to [now]: whole minutes, at least one,
 * never more than a day (a forgotten timer is not a 3-day invoice line). */
export function elapsedMinutes(since: Date, now: Date): number {
  const ms = Math.max(0, now.getTime() - since.getTime());
  return Math.min(MAX_ENTRY_MINUTES, Math.max(1, Math.round(ms / 60000)));
}

/** `LB-3F9A12CD-004`: the case's short id and the invoice's number in it. */
export const invoiceNumber = (caseId: string, seq: number): string =>
  `LB-${caseId.replace(/-/g, '').slice(0, 8).toUpperCase()}-${String(seq).padStart(3, '0')}`;

export interface BillableTime {
  minutes: number;
  rateCents: number;
}

export interface Totals {
  minutes: number;
  timeCents: number;
  expensesCents: number;
  totalCents: number;
}

export function totalsOf(
  time: readonly BillableTime[],
  expenseCents: readonly number[],
): Totals {
  const minutes = time.reduce((n, t) => n + t.minutes, 0);
  const timeCents = time.reduce(
    (n, t) => n + entryCents(t.minutes, t.rateCents),
    0,
  );
  const expensesCents = expenseCents.reduce((n, c) => n + c, 0);
  return {
    minutes,
    timeCents,
    expensesCents,
    totalCents: timeCents + expensesCents,
  };
}

/** `YYYY-MM-DD` of a calendar date column. */
export const dayText = (d: Date): string => d.toISOString().slice(0, 10);
