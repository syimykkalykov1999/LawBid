import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { reportDayBounds } from './report-day';
import { isValidTimeZone } from './zoned-time';

/**
 * Row 180 follow-up B9: days that carry money or a nightly job (piecework
 * pay, staff-security anomalies) are cut in the owner's report time zone
 * (`admin.report_timezone`) like the rest of the admin — with a SAFE
 * cut-over. A day is a label (YYYY-MM-DD, the stored `day` and the accrual
 * reference) plus a window [from, to). When the zone changes, the windows
 * of days that may already be counted never move, and the windows keep
 * tiling the timeline: no instant falls into two days (paid twice) or into
 * none (skipped).
 *
 * The schedule is the list of zone changes, each from a label on. Before
 * the first one the days are the old UTC days. A change is recorded the
 * first time a run sees a new zone, from the day AFTER the one running at
 * that moment (which, not finished yet, has never been counted): the
 * running day stretches or shrinks to the new zone's next midnight. A day
 * never starts before the day before it (a jump of more than a day east
 * gives an empty day, never an overlap). Stripe changes a report time zone
 * the same way: «from the next day on», never re-cutting reported days.
 */

export interface DayZone {
  /** First label (YYYY-MM-DD) cut in [tz]. */
  from: string;
  tz: string;
}
export type DaySchedule = DayZone[];

const BASE: DayZone = { from: '0000-01-01', tz: 'UTC' };
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const shift = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS)
    .toISOString()
    .slice(0, 10);

const zones = (s: DaySchedule): DayZone[] => [BASE, ...s];

/** Local midnight of [day] in [tz], ignoring the schedule. */
const rawStart = (day: string, tz: string): Date =>
  reportDayBounds(day, tz).from;

/** The instant the day [day] begins under [s]. */
function dayStart(s: DaySchedule, day: string): Date {
  const all = zones(s);
  let i = 0;
  for (let k = 1; k < all.length; k++) if (all[k].from <= day) i = k;
  let t = rawStart(day, all[i].tz).getTime();
  // Never before the start of any earlier day (running maximum: inside a
  // zone the starts only grow, so the last day of each earlier zone is
  // enough).
  for (let k = 1; k <= i; k++) {
    t = Math.max(t, rawStart(shift(all[k].from, -1), all[k - 1].tz).getTime());
  }
  return new Date(t);
}

/** [from, to) of [day] under [s]. */
export function dayWindow(
  s: DaySchedule,
  day: string,
): { from: Date; to: Date } {
  return { from: dayStart(s, day), to: dayStart(s, shift(day, 1)) };
}

/** The label of the day whose window holds [now]. */
export function labelAt(s: DaySchedule, now: Date): string {
  const t = now.getTime();
  const utc = now.toISOString().slice(0, 10);
  for (let n = -2; n <= 2; n++) {
    const d = shift(utc, n);
    const w = dayWindow(s, d);
    if (w.from.getTime() <= t && t < w.to.getTime()) return d;
  }
  return utc; // unreachable for real zones (offsets within ±14 h)
}

/** Every label whose day ended in (from, to], oldest first. */
export function daysEndedIn(s: DaySchedule, from: Date, to: Date): string[] {
  const out: string[] = [];
  const last = labelAt(s, to);
  let d = shift(labelAt(s, from), -1);
  while (d <= last) {
    const end = dayWindow(s, d).to.getTime();
    if (end > from.getTime() && end <= to.getTime()) out.push(d);
    d = shift(d, 1);
  }
  return out;
}

/** [s] with [tz] in force from the day after the one running at [now];
 * null when [tz] is already the zone in force (or not a real zone). */
export function withZone(
  s: DaySchedule,
  tz: string,
  now: Date,
): DaySchedule | null {
  const current = zones(s)[s.length].tz;
  if (!isValidTimeZone(tz) || tz === current) return null;
  const from = shift(labelAt(s, now), 1);
  // A change recorded the same running day replaces the pending one.
  const kept = s.filter((z) => z.from < from);
  return [...kept, { from, tz }];
}

/** A stored value → a schedule (anything malformed = none). */
export function parseSchedule(v: unknown): DaySchedule {
  if (!Array.isArray(v)) return [];
  const out: DaySchedule = [];
  for (const z of v as unknown[]) {
    const o = z as { from?: unknown; tz?: unknown };
    if (
      typeof o?.from !== 'string' ||
      !DAY_RE.test(o.from) ||
      !isValidTimeZone(o.tz)
    ) {
      return [];
    }
    out.push({ from: o.from, tz: o.tz });
  }
  return out.sort((a, b) => (a.from < b.from ? -1 : 1));
}

/**
 * The schedule stored under [key] in app_config, with [tz] recorded when it
 * is new (compare-and-set: two runs at once agree on one cut-over).
 */
export async function currentSchedule(
  prisma: Pick<PrismaService, 'appConfig'>,
  key: string,
  tz: string,
  now: Date = new Date(),
): Promise<DaySchedule> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await prisma.appConfig.findUnique({ where: { key } });
    const s = parseSchedule(row?.value);
    const next = withZone(s, tz, now);
    if (!next) return s;
    const value = next as unknown as Prisma.InputJsonValue;
    const won = row
      ? await prisma.appConfig.updateMany({
          where: { key, value: { equals: row.value as Prisma.InputJsonValue } },
          data: { value },
        })
      : await prisma.appConfig.createMany({
          data: [{ key, value }],
          skipDuplicates: true,
        });
    if (won.count === 1) return next;
  }
  const row = await prisma.appConfig.findUnique({ where: { key } });
  return parseSchedule(row?.value);
}

/** The stored `day` (DATE column) of a label. */
export const labelDate = (day: string): Date =>
  new Date(`${day}T00:00:00.000Z`);
