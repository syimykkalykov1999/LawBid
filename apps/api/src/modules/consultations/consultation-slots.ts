import {
  addDaysIso,
  parseIsoDate,
  zonedParts,
  zonedWallToUtc,
} from '../../common/utils/zoned-wall';

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface SlotRules {
  slotMinutes: number;
  bufferMinutes: number;
  minNoticeHours: number;
  horizonDays: number;
}

/** A weekly window: ISO weekday 1…7, minutes from midnight (attorney's zone). */
export interface SlotWindow {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

/** Days off, inclusive, as attorney-local dates (YYYY-MM-DD). */
export interface SlotTimeOff {
  startsOn: string;
  endsOn: string;
}

/** A booking that holds time: pending or confirmed. */
export interface SlotBusy {
  startsAt: Date;
  endsAt: Date;
}

export interface SlotInput {
  timeZone: string;
  rules: SlotRules;
  windows: SlotWindow[];
  timeOff: SlotTimeOff[];
  busy: SlotBusy[];
  now: Date;
  /** First attorney-local date (inclusive). */
  fromDate: string;
  /** Last attorney-local date (inclusive). */
  toDate: string;
}

/**
 * The bookable start times of an attorney between two attorney-local
 * dates. A slot is `slotMinutes` long; the next one starts after
 * `bufferMinutes` of rest. Two windows in one day leave a break between
 * them. A slot needs `minNoticeHours` of notice, lies within `horizonDays`,
 * misses days off and does not touch a booking (a booking holds its own
 * time plus the buffer). Returned sorted, without duplicates, as instants.
 */
export function generateSlots(input: SlotInput): Date[] {
  const { rules, now } = input;
  const earliest = now.getTime() + rules.minNoticeHours * HOUR_MS;
  const latest = now.getTime() + rules.horizonDays * DAY_MS;
  const slotMs = rules.slotMinutes * MIN_MS;
  const bufferMs = rules.bufferMinutes * MIN_MS;
  const out = new Set<number>();

  const first = parseIsoDate(input.fromDate);
  const last = parseIsoDate(input.toDate);
  if (!first || !last) return [];

  for (
    let date = input.fromDate;
    date <= input.toDate;
    date = addDaysIso(date, 1)
  ) {
    if (input.timeOff.some((o) => o.startsOn <= date && date <= o.endsOn)) {
      continue;
    }
    const p = parseIsoDate(date);
    if (!p) continue;
    const weekday =
      ((new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() + 6) % 7) +
      1;
    for (const w of input.windows) {
      if (w.weekday !== weekday) continue;
      const step = rules.slotMinutes + rules.bufferMinutes;
      for (
        let t = w.startMinute;
        t + rules.slotMinutes <= w.endMinute;
        t += step
      ) {
        const start = zonedWallToUtc(p.year, p.month, p.day, t, input.timeZone);
        if (!start) continue;
        const s = start.getTime();
        if (s < earliest || s > latest) continue;
        const holdEnd = s + slotMs + bufferMs;
        const clash = input.busy.some(
          (b) =>
            b.startsAt.getTime() < holdEnd && b.endsAt.getTime() + bufferMs > s,
        );
        if (!clash) out.add(s);
      }
    }
  }
  return [...out].sort((a, b) => a - b).map((ms) => new Date(ms));
}

/** The attorney-local calendar date of an instant. */
export function localDateOf(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}
