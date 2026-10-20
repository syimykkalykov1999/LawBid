/**
 * Wall-clock time in an IANA zone without a date library (Intl only).
 * The planner repeats tasks and the daily reminders go out by the
 * *person's* local clock, DST included: "every day at 09:00" stays 09:00
 * across a clock change, "weekdays" means the local Monday–Friday.
 */

export interface ZonedParts {
  year: number;
  /** 1–12. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday … 6 = Saturday, by the local calendar. */
  weekday: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Whether `timeZone` is an IANA zone this runtime knows. */
export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone.length === 0) return false;
  if (timeZone.length > 64) return false;
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** A zone the runtime knows, else UTC (a bad stored value never throws). */
export function safeTimeZone(timeZone: string | null | undefined): string {
  return isValidTimeZone(timeZone) ? timeZone : 'UTC';
}

/** The local calendar and clock of an instant in `timeZone`. */
export function zonedParts(at: Date, timeZone: string): ZonedParts {
  const v: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(at)) {
    if (p.type !== 'literal') v[p.type] = Number(p.value);
  }
  const weekday = new Date(Date.UTC(v.year, v.month - 1, v.day)).getUTCDay();
  return {
    year: v.year,
    month: v.month,
    day: v.day,
    hour: v.hour % 24,
    minute: v.minute,
    second: v.second,
    weekday,
  };
}

/** The zone's offset from UTC at an instant, in ms (east is positive). */
function offsetMs(at: Date, timeZone: string): number {
  const p = zonedParts(at, timeZone);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * The instant of a local date and time. A time skipped by the clock change
 * (02:30 on the spring-forward day) lands just after the gap; a time that
 * happens twice (the fall-back hour) is the first one.
 */
export function zonedToUtc(
  local: {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
    second?: number;
  },
  timeZone: string,
): Date {
  const guess = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour ?? 0,
    local.minute ?? 0,
    local.second ?? 0,
  );
  const first = guess - offsetMs(new Date(guess), timeZone);
  const second = guess - offsetMs(new Date(first), timeZone);
  if (first === second) return new Date(first);
  // The offset differs on the two sides of a change: take the earlier
  // instant when both read as the wanted wall time (fall back), else the
  // later one (spring forward: the wall time does not exist).
  const a = zonedParts(new Date(first), timeZone);
  const matches = (p: ZonedParts) =>
    p.hour === (local.hour ?? 0) && p.minute === (local.minute ?? 0);
  if (matches(a)) return new Date(Math.min(first, second));
  return new Date(Math.max(first, second));
}

export type RepeatRule =
  'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The next time of a repeating task, in the owner's zone: the same local
 * wall-clock time on the next local day / weekday / week / month / year.
 * `monthly` on the 31st lands on the last day of a shorter month; Feb 29
 * yearly lands on Feb 28 in a common year.
 */
export function nextOccurrenceZoned(
  from: Date,
  repeat: RepeatRule,
  timeZone: string,
): Date {
  if (repeat === 'none') return new Date(from.getTime());
  // Intl reads whole seconds; the milliseconds ride along unchanged.
  const ms = ((from.getTime() % 1000) + 1000) % 1000;
  const next = nextOccurrenceWhole(from, repeat, timeZone);
  return new Date(next.getTime() + ms);
}

function nextOccurrenceWhole(
  from: Date,
  repeat: RepeatRule,
  timeZone: string,
): Date {
  const p = zonedParts(from, timeZone);
  const base = { hour: p.hour, minute: p.minute, second: p.second };
  const at = (year: number, month: number, day: number): Date =>
    zonedToUtc({ year, month, day, ...base }, timeZone);
  // Calendar arithmetic runs on a UTC date that stands for the local day.
  const day = new Date(Date.UTC(p.year, p.month - 1, p.day));
  switch (repeat) {
    case 'daily':
      day.setUTCDate(day.getUTCDate() + 1);
      break;
    case 'weekdays':
      do {
        day.setUTCDate(day.getUTCDate() + 1);
      } while (day.getUTCDay() === 0 || day.getUTCDay() === 6);
      break;
    case 'weekly':
      day.setUTCDate(day.getUTCDate() + 7);
      break;
    case 'monthly': {
      const month = p.month === 12 ? 1 : p.month + 1;
      const year = p.month === 12 ? p.year + 1 : p.year;
      return at(year, month, Math.min(p.day, daysInMonth(year, month)));
    }
    case 'yearly': {
      const year = p.year + 1;
      return at(year, p.month, Math.min(p.day, daysInMonth(year, p.month)));
    }
    default:
      break;
  }
  return at(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate());
}

/**
 * The next instant at/after `from`'s following local `hour:minute` in
 * `timeZone` — "tomorrow 09:00 local" for a daily reminder. Today's slot
 * counts when `from` is before it.
 */
export function localSlotOnOrAfter(
  from: Date,
  timeZone: string,
  hour: number,
  minute = 0,
): Date {
  const p = zonedParts(from, timeZone);
  const today = zonedToUtc(
    { year: p.year, month: p.month, day: p.day, hour, minute },
    timeZone,
  );
  if (today.getTime() >= from.getTime()) return today;
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return zonedToUtc(
    {
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate(),
      hour,
      minute,
    },
    timeZone,
  );
}

/** `YYYY-MM-DD` of an instant on the local calendar. */
export function localIsoDate(at: Date, timeZone: string): string {
  const p = zonedParts(at, timeZone);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}
