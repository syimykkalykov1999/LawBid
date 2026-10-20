/**
 * Wall-clock time in an IANA time zone (America/New_York) without a date
 * library: Node ships the full ICU data. Used by consultation slots (the
 * attorney's weekly hours are wall-clock times) and reminders.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export interface ZonedParts {
  year: number;
  /** 1…12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  weekday: number;
}

/** True for a zone name Node knows ("America/New_York", "UTC"). */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || timeZone.length > 64) return false;
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The wall-clock fields of [instant] in [timeZone]. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = formatter(timeZone).formatToParts(instant);
  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const year = get('year');
  const month = get('month');
  const day = get('day');
  return {
    year,
    month,
    day,
    hour: get('hour') % 24,
    minute: get('minute'),
    weekday: isoWeekday(year, month, day),
  };
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a calendar date. */
export function isoWeekday(year: number, month: number, day: number): number {
  const d = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Milliseconds the zone is ahead of UTC at [instant]. */
function offsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
  return asUtc - Math.floor(instant.getTime() / 60_000) * 60_000;
}

/**
 * The instant at which the wall clock in [timeZone] reads
 * [year]-[month]-[day] [minuteOfDay] — or null when that time does not
 * exist there (the hour skipped when clocks go forward). When it happens
 * twice (clocks go back) the first one is returned.
 */
export function zonedWallToUtc(
  year: number,
  month: number,
  day: number,
  minuteOfDay: number,
  timeZone: string,
): Date | null {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  // Two passes settle the offset around a transition.
  let guess = naive - offsetMs(new Date(naive), timeZone);
  guess = naive - offsetMs(new Date(guess), timeZone);
  let result = new Date(guess);
  // A repeated hour: prefer the earlier instant.
  const earlier = new Date(guess - 3_600_000);
  const e = zonedParts(earlier, timeZone);
  if (
    e.year === year &&
    e.month === month &&
    e.day === day &&
    e.hour === hour &&
    e.minute === minute
  ) {
    result = earlier;
  }
  const back = zonedParts(result, timeZone);
  if (
    back.year !== year ||
    back.month !== month ||
    back.day !== day ||
    back.hour !== hour ||
    back.minute !== minute
  ) {
    return null;
  }
  return result;
}

/** "2026-03-08" → [2026, 3, 8]; null for anything else (or a date that
 * does not exist). */
export function parseIsoDate(
  value: string,
): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Adds [days] to an ISO calendar date (no time zone involved). */
export function addDaysIso(value: string, days: number): string {
  const p = parseIsoDate(value);
  if (!p) throw new Error(`bad date ${value}`);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return formatIsoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
