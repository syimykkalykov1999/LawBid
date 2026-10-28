import { Prisma } from '@prisma/client';
import type { AppSettingsService } from '../../../common/app-settings/app-settings.service';

/**
 * Owner 2026-10-05: how soon the client needs an attorney — either a level
 * the client picks, or a concrete date (a court hearing, a filing
 * deadline…) from which the level follows automatically as the date
 * approaches. One rule for the API, the feed filter, the reminders and
 * the admin panel; the mobile app mirrors it in
 * features/cases/domain/case_urgency.dart.
 *
 * Values in order from the calmest to the most pressing. `by_date` means
 * "see deadline_at" (the CHECK in the migration requires it).
 */
export const CASE_URGENCIES = [
  'flexible',
  'within_month',
  'soon',
  'urgent',
  'very_urgent',
  'by_date',
] as const;
export type CaseUrgency = (typeof CASE_URGENCIES)[number];

/** The level a case reads as right now (a chosen level, or the one its
 * date implies). `overdue`: the date has passed. */
export const CASE_URGENCY_LEVELS = [
  'flexible',
  'within_month',
  'soon',
  'urgent',
  'very_urgent',
  'overdue',
] as const;
export type CaseUrgencyLevel = (typeof CASE_URGENCY_LEVELS)[number];

/** What the date is (shown next to it on the card). */
export const CASE_DEADLINE_KINDS = [
  'court_hearing',
  'filing_deadline',
  'meeting',
  'signing',
  'other',
] as const;
export type CaseDeadlineKind = (typeof CASE_DEADLINE_KINDS)[number];

/** A date at most this far ahead (a court date two years out is real). */
export const CASE_DEADLINE_MAX_DAYS = 730;

/**
 * Days left until the date at or below which a dated case reads as that
 * level (admin: Система → Настройки, `cases.urgency_days_*`).
 */
export interface UrgencyThresholds {
  veryUrgent: number;
  urgent: number;
  soon: number;
  withinMonth: number;
}

export const DEFAULT_URGENCY_THRESHOLDS: UrgencyThresholds = {
  veryUrgent: 1,
  urgent: 3,
  soon: 7,
  withinMonth: 31,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` of [d] (UTC — deadline_at is a calendar date). */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parses `YYYY-MM-DD` to a UTC midnight Date, or null. */
export function parseIsoDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || isoDate(d) !== s ? null : d;
}

/**
 * The calendar date of [now] in [timeZone] as a UTC midnight, or [now]'s
 * UTC date when the zone is missing or unknown. Algo audit 2026-10-27
 * (CASES H-3): a Californian client's "today" at 17:30 is already
 * tomorrow in UTC, so a dated case read as `overdue` all evening.
 */
export function todayIn(now: Date, timeZone?: string | null): number {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(now);
      const get = (t: string) =>
        Number(parts.find((p) => p.type === t)?.value ?? NaN);
      const y = get('year');
      const m = get('month');
      const d = get('day');
      if ([y, m, d].every(Number.isFinite)) return Date.UTC(y, m - 1, d);
    } catch {
      // unknown zone: fall through to UTC
    }
  }
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** Whole calendar days from [now]'s date (in [timeZone], else UTC) to
 * [deadline]. */
export function daysUntil(
  deadline: Date,
  now: Date = new Date(),
  timeZone?: string | null,
): number {
  const today = todayIn(now, timeZone);
  const day = Date.UTC(
    deadline.getUTCFullYear(),
    deadline.getUTCMonth(),
    deadline.getUTCDate(),
  );
  return Math.round((day - today) / DAY_MS);
}

/** The level a dated case reads as with [days] left. */
export function levelForDays(
  days: number,
  t: UrgencyThresholds = DEFAULT_URGENCY_THRESHOLDS,
): CaseUrgencyLevel {
  if (days < 0) return 'overdue';
  if (days <= t.veryUrgent) return 'very_urgent';
  if (days <= t.urgent) return 'urgent';
  if (days <= t.soon) return 'soon';
  if (days <= t.withinMonth) return 'within_month';
  return 'flexible';
}

/** The level a case reads as now; null when the client set nothing. */
export function effectiveUrgency(
  urgency: string | null,
  deadlineAt: Date | null,
  now: Date = new Date(),
  t: UrgencyThresholds = DEFAULT_URGENCY_THRESHOLDS,
  timeZone?: string | null,
): CaseUrgencyLevel | null {
  if (deadlineAt) {
    return levelForDays(daysUntil(deadlineAt, now, timeZone), t);
  }
  if (!urgency || urgency === 'by_date') return null;
  return (CASE_URGENCY_LEVELS as readonly string[]).includes(urgency)
    ? (urgency as CaseUrgencyLevel)
    : null;
}

/** Wire fields of a case's urgency (feed card, detail, client views). */
export interface CaseUrgencyFields {
  urgency: CaseUrgency | null;
  urgencyLevel: CaseUrgencyLevel | null;
  deadlineAt: string | null;
  deadlineKind: CaseDeadlineKind | null;
}

export function urgencyFields(
  row: {
    urgency: string | null;
    deadline_at: Date | null;
    deadline_kind: string | null;
  },
  now: Date = new Date(),
  t: UrgencyThresholds = DEFAULT_URGENCY_THRESHOLDS,
): CaseUrgencyFields {
  return {
    urgency: row.urgency as CaseUrgency | null,
    urgencyLevel: effectiveUrgency(row.urgency, row.deadline_at, now, t),
    deadlineAt: row.deadline_at ? isoDate(row.deadline_at) : null,
    deadlineKind: row.deadline_kind as CaseDeadlineKind | null,
  };
}

export class UrgencyInputError extends Error {
  constructor(
    message: string,
    readonly field: 'urgency' | 'deadlineAt' | 'deadlineKind',
  ) {
    super(message);
  }
}

export interface UrgencyInput {
  urgency?: CaseUrgency | null;
  deadlineAt?: string | null;
  deadlineKind?: CaseDeadlineKind | null;
}

export interface UrgencyColumns {
  urgency: CaseUrgency | null;
  deadline_at: Date | null;
  deadline_kind: CaseDeadlineKind | null;
}

/** True when the request touches the urgency at all. */
export function hasUrgencyInput(dto: UrgencyInput): boolean {
  return (
    dto.urgency !== undefined ||
    dto.deadlineAt !== undefined ||
    dto.deadlineKind !== undefined
  );
}

/**
 * The columns to store for an urgency request, given what is stored now.
 * A date means `by_date` (sending only a date is enough); a level clears
 * the date; null clears everything. A new date may not be in the past or
 * more than CASE_DEADLINE_MAX_DAYS ahead. Throws UrgencyInputError.
 */
export function resolveUrgencyInput(
  dto: UrgencyInput,
  current: UrgencyColumns | null,
  now: Date = new Date(),
): UrgencyColumns {
  let urgency: CaseUrgency | null =
    dto.urgency !== undefined ? dto.urgency : (current?.urgency ?? null);
  let deadline: Date | null = current?.deadline_at ?? null;
  let kind: CaseDeadlineKind | null =
    dto.deadlineKind !== undefined
      ? dto.deadlineKind
      : (current?.deadline_kind ?? null);

  if (dto.deadlineAt !== undefined) {
    if (dto.deadlineAt === null) {
      deadline = null;
      if (dto.urgency === undefined && urgency === 'by_date') urgency = null;
    } else {
      const parsed = parseIsoDate(dto.deadlineAt.slice(0, 10));
      if (!parsed) {
        throw new UrgencyInputError(
          'deadlineAt must be a date (YYYY-MM-DD).',
          'deadlineAt',
        );
      }
      const days = daysUntil(parsed, now);
      // A day of slack: the client's "today" may still be yesterday in UTC.
      if (days < -1) {
        throw new UrgencyInputError(
          'The date has already passed.',
          'deadlineAt',
        );
      }
      if (days > CASE_DEADLINE_MAX_DAYS) {
        throw new UrgencyInputError(
          `The date is more than ${CASE_DEADLINE_MAX_DAYS} days ahead.`,
          'deadlineAt',
        );
      }
      deadline = parsed;
      if (dto.urgency === undefined || dto.urgency === null) {
        urgency = 'by_date';
      }
    }
  }

  if (urgency === 'by_date') {
    if (!deadline) {
      throw new UrgencyInputError('"by_date" needs deadlineAt.', 'deadlineAt');
    }
  } else {
    // A level (or nothing): no date, no kind.
    deadline = null;
    kind = null;
  }
  return { urgency, deadline_at: deadline, deadline_kind: kind };
}

/**
 * SQL for "today" as a DATE: the viewer's calendar day in [timeZone]
 * (algo audit 2026-10-27, CASES H-3), or CURRENT_DATE (UTC) without one.
 * An unknown zone name makes Postgres raise, so only IANA-looking names
 * are passed through.
 */
export function todaySql(timeZone?: string | null): Prisma.Sql {
  return timeZone && /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/.test(timeZone)
    ? Prisma.sql`(now() AT TIME ZONE ${timeZone})::date`
    : Prisma.sql`CURRENT_DATE`;
}

/**
 * SQL for the level of case alias `c` right now (null when unset), with
 * the same thresholds as [levelForDays]. [today] defaults to CURRENT_DATE
 * (UTC); the feed passes the viewer's day ([todaySql]).
 */
export function effectiveUrgencySql(
  t: UrgencyThresholds = DEFAULT_URGENCY_THRESHOLDS,
  today: Prisma.Sql = Prisma.sql`CURRENT_DATE`,
): Prisma.Sql {
  return Prisma.sql`(CASE
    WHEN c.deadline_at IS NOT NULL THEN (CASE
      WHEN (c.deadline_at - ${today}) < 0 THEN 'overdue'
      WHEN (c.deadline_at - ${today}) <= ${t.veryUrgent} THEN 'very_urgent'
      WHEN (c.deadline_at - ${today}) <= ${t.urgent} THEN 'urgent'
      WHEN (c.deadline_at - ${today}) <= ${t.soon} THEN 'soon'
      WHEN (c.deadline_at - ${today}) <= ${t.withinMonth} THEN 'within_month'
      ELSE 'flexible' END)
    WHEN c.urgency = 'by_date' THEN NULL
    ELSE c.urgency END)`;
}

/** The feed/search filter values: "at least this urgent today". */
export const CASE_MIN_URGENCIES = [
  'within_month',
  'soon',
  'urgent',
  'very_urgent',
] as const;
export type CaseMinUrgency = (typeof CASE_MIN_URGENCIES)[number];

/**
 * SQL conditions (case alias `c`) for the "at least this urgent" and
 * "with a date still ahead" filters — one rule for the feed and search.
 * Past dates (`overdue`) never match a minimum.
 */
export function urgencyFilterSql(
  minUrgency: CaseMinUrgency | undefined,
  hasDeadline: boolean | undefined,
  t: UrgencyThresholds = DEFAULT_URGENCY_THRESHOLDS,
  timeZone?: string | null,
): Prisma.Sql {
  const minRank = minUrgency ? CASE_URGENCY_LEVELS.indexOf(minUrgency) : -1;
  const atLeast = CASE_URGENCY_LEVELS.filter(
    (l, i) => l !== 'overdue' && i >= minRank,
  );
  const today = todaySql(timeZone);
  return Prisma.sql`
    ${minRank >= 0 ? Prisma.sql`AND ${effectiveUrgencySql(t, today)} = ANY(${atLeast}::TEXT[])` : Prisma.empty}
    ${hasDeadline ? Prisma.sql`AND c.deadline_at >= ${today}` : Prisma.empty}`;
}

/** Levels at or above which a case counts as urgent (alerts, filters). */
export const URGENT_LEVELS: readonly CaseUrgencyLevel[] = [
  'urgent',
  'very_urgent',
];

/** The thresholds from the admin settings (defaults without a settings
 * service, e.g. in unit tests), forced into ascending order. */
export async function loadUrgencyThresholds(
  settings?: AppSettingsService | null,
): Promise<UrgencyThresholds> {
  if (!settings) return DEFAULT_URGENCY_THRESHOLDS;
  try {
    const [veryUrgent, urgent, soon, withinMonth] = await Promise.all([
      settings.number('cases.urgency_days_very_urgent'),
      settings.number('cases.urgency_days_urgent'),
      settings.number('cases.urgency_days_soon'),
      settings.number('cases.urgency_days_within_month'),
    ]);
    const u = Math.max(veryUrgent, urgent);
    const s = Math.max(u, soon);
    return {
      veryUrgent,
      urgent: u,
      soon: s,
      withinMonth: Math.max(s, withinMonth),
    };
  } catch {
    return DEFAULT_URGENCY_THRESHOLDS;
  }
}
