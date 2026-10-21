import {
  addDaysIso,
  formatIsoDate,
  isoWeekday,
  parseIsoDate,
} from '../../common/utils/zoned-wall';

/** A period a court or a statute sets (a row of `deadline_rules`). */
export interface DeadlinePeriod {
  amount: number;
  unit: 'day' | 'month' | 'year';
  dayType: 'calendar' | 'business';
  direction: 'after' | 'before';
}

export interface DeadlineResult {
  /** The last day (ISO date) — after any roll-over. */
  dueDate: string;
  /** The raw date before rolling past weekends and holidays. */
  rawDate: string;
  /** The day moved because the raw date was a weekend or a court holiday. */
  rolled: boolean;
  /** Holidays skipped or stepped over (ISO dates, sorted). */
  holidaysUsed: string[];
}

const MAX_STEPS = 400;

function isWeekend(date: string): boolean {
  const p = parseIsoDate(date);
  if (!p) throw new Error(`bad date ${date}`);
  return isoWeekday(p.year, p.month, p.day) >= 6;
}

/** Adds calendar months/years keeping the day (clamped to the month end). */
export function addMonthsIso(date: string, months: number): string {
  const p = parseIsoDate(date);
  if (!p) throw new Error(`bad date ${date}`);
  const total = p.year * 12 + (p.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return formatIsoDate(year, month, Math.min(p.day, last));
}

/**
 * Counts a deadline like FRCP 6(a): the event day is not counted; a period
 * in days runs day by day (calendar days include weekends; business days
 * skip weekends and [holidays]); a period in months or years lands on the
 * same day number. A date that falls on a weekend or a court holiday moves
 * to the next business day — or, for a period counted backwards from an
 * event (a motion due 14 days before a hearing), to the previous one.
 */
export function computeDeadline(
  eventDate: string,
  period: DeadlinePeriod,
  holidays: ReadonlySet<string>,
): DeadlineResult {
  if (!parseIsoDate(eventDate)) throw new Error(`bad date ${eventDate}`);
  const sign = period.direction === 'after' ? 1 : -1;
  const used = new Set<string>();
  const closed = (d: string): boolean => {
    const h = holidays.has(d);
    if (h) used.add(d);
    return isWeekend(d) || h;
  };
  let raw: string;
  if (period.unit === 'day' && period.dayType === 'business') {
    let d = eventDate;
    let left = period.amount;
    let steps = 0;
    while (left > 0) {
      d = addDaysIso(d, sign);
      if (++steps > MAX_STEPS) throw new Error('period too long');
      if (!closed(d)) left -= 1;
    }
    raw = d;
  } else if (period.unit === 'day') {
    raw = addDaysIso(eventDate, sign * period.amount);
  } else {
    const months = period.unit === 'year' ? period.amount * 12 : period.amount;
    raw = addMonthsIso(eventDate, sign * months);
  }
  let due = raw;
  let steps = 0;
  while (closed(due)) {
    due = addDaysIso(due, sign);
    if (++steps > MAX_STEPS) throw new Error('no open day found');
  }
  return {
    dueDate: due,
    rawDate: raw,
    rolled: due !== raw,
    holidaysUsed: [...used].sort(),
  };
}
