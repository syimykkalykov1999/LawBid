import type { AppSettingsService } from '../../../common/app-settings/app-settings.service';

/**
 * Owner 2026-10-17/18 (OQ-054): stale cases in the attorney feed.
 *
 * "Silent" = now − `client_active_at` (the client's own actions only;
 * attorney bids and comments never count). Silent for the case's first
 * timer → ask «Вам ещё нужен адвокат?» once; unanswered and no activity
 * for the second → pause (hidden from the feed, not deleted); paused for
 * `archiveAfterPauseDays` → archived. «По дате»: asked once the date has
 * passed, paused `pauseDays.by_date` days after the date.
 *
 * This file is pure: the rules and the settings loader. The jobs and the
 * DB writes live in CaseLifecycleService / jobs/handlers/case-stale.jobs.
 */
export const DAY_MS = 24 * 60 * 60 * 1000;

export const STALE_URGENCIES = [
  'very_urgent',
  'urgent',
  'soon',
  'within_month',
  'flexible',
  'by_date',
] as const;
export type StaleUrgency = (typeof STALE_URGENCIES)[number];

/** A date case is paused at least this long after its question was sent. */
export const MIN_GRACE_AFTER_QUESTION_MS = DAY_MS;
/** «Сменить на «Не срочно»» is offered for urgent cases older than this. */
export const MAKE_NOT_URGENT_AFTER_DAYS = 7;
/** The question goes out in the client's daytime only. */
export const ASK_FROM_HOUR = 9;
export const ASK_TO_HOUR = 21;
export const DEFAULT_ASK_TIMEZONE = 'America/New_York';

export interface StaleTimers {
  /** Days of silence before the question (not for by_date). */
  askDays: Record<Exclude<StaleUrgency, 'by_date'>, number>;
  /** Days without an answer before the pause; for by_date: days after the
   * date. */
  pauseDays: Record<StaleUrgency, number>;
  archiveAfterPauseDays: number;
}

export const DEFAULT_STALE_TIMERS: StaleTimers = {
  askDays: {
    very_urgent: 2,
    urgent: 4,
    soon: 7,
    within_month: 30,
    flexible: 30,
  },
  pauseDays: {
    very_urgent: 1,
    urgent: 2,
    soon: 3,
    within_month: 4,
    flexible: 14,
    by_date: 3,
  },
  archiveAfterPauseDays: 30,
};

/** The admin's timers (`cases.stale_*`); defaults without a settings
 * service (unit tests) or when a read fails. */
export async function loadStaleTimers(
  settings?: AppSettingsService | null,
): Promise<StaleTimers> {
  if (!settings) return DEFAULT_STALE_TIMERS;
  try {
    const ask = async (u: Exclude<StaleUrgency, 'by_date'>) =>
      positive(
        await settings.number(`cases.stale_ask_days_${u}`),
        DEFAULT_STALE_TIMERS.askDays[u],
      );
    const pause = async (u: StaleUrgency) =>
      positive(
        await settings.number(`cases.stale_pause_days_${u}`),
        DEFAULT_STALE_TIMERS.pauseDays[u],
      );
    return {
      askDays: {
        very_urgent: await ask('very_urgent'),
        urgent: await ask('urgent'),
        soon: await ask('soon'),
        within_month: await ask('within_month'),
        flexible: await ask('flexible'),
      },
      pauseDays: {
        very_urgent: await pause('very_urgent'),
        urgent: await pause('urgent'),
        soon: await pause('soon'),
        within_month: await pause('within_month'),
        flexible: await pause('flexible'),
        by_date: await pause('by_date'),
      },
      archiveAfterPauseDays: positive(
        await settings.number('cases.stale_archive_after_pause_days'),
        DEFAULT_STALE_TIMERS.archiveAfterPauseDays,
      ),
    };
  } catch {
    return DEFAULT_STALE_TIMERS;
  }
}

function positive(n: number, fallback: number): number {
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** The timer family of a case: no urgency = flexible; by_date needs a date. */
export function staleKind(
  urgency: string | null,
  deadlineAt: Date | null,
): StaleUrgency {
  if (urgency === 'by_date') return deadlineAt ? 'by_date' : 'flexible';
  return urgency &&
    (STALE_URGENCIES as readonly string[]).includes(urgency) &&
    urgency !== 'by_date'
    ? (urgency as StaleUrgency)
    : 'flexible';
}

export interface StaleFacts {
  urgency: string | null;
  /** A calendar date (UTC midnight). */
  deadlineAt: Date | null;
  clientActiveAt: Date;
  /** When the question was sent (null = never / cleared by an answer). */
  promptSentAt: Date | null;
  pausedAt: Date | null;
}

/** The question belongs to the current silent period: sent after the
 * client's last action. */
export function questionOutstanding(f: StaleFacts): boolean {
  return (
    f.promptSentAt !== null &&
    f.promptSentAt.getTime() >= f.clientActiveAt.getTime()
  );
}

/** When the question becomes due, or null when it is not due at all (a
 * date case whose client acted after the date passed). */
export function askDueAt(f: StaleFacts, timers: StaleTimers): Date | null {
  const kind = staleKind(f.urgency, f.deadlineAt);
  if (kind === 'by_date' && f.deadlineAt) {
    // "The date has passed" = the day after it.
    const passed = new Date(f.deadlineAt.getTime() + DAY_MS);
    return f.clientActiveAt.getTime() >= passed.getTime() ? null : passed;
  }
  return new Date(
    f.clientActiveAt.getTime() +
      timers.askDays[kind as Exclude<StaleUrgency, 'by_date'>] * DAY_MS,
  );
}

/** Ask now? Open and visible, silent long enough, and not yet asked in
 * this silent period ("never repeat for the same silent period"). */
export function shouldAsk(
  f: StaleFacts,
  timers: StaleTimers,
  now: Date,
): boolean {
  if (f.pausedAt || questionOutstanding(f)) return false;
  const due = askDueAt(f, timers);
  return due !== null && now.getTime() >= due.getTime();
}

/** Bids made after this moment count as "new bids during the silent
 * window": the case is not asked (the bid's own push already reminds the
 * client). The window is as long as the first timer; for a date case it
 * starts when the date passed. */
export function bidWindowStart(
  f: StaleFacts,
  timers: StaleTimers,
  now: Date,
): Date {
  const kind = staleKind(f.urgency, f.deadlineAt);
  if (kind === 'by_date' && f.deadlineAt) {
    return new Date(f.deadlineAt.getTime() + DAY_MS);
  }
  const days = timers.askDays[kind as Exclude<StaleUrgency, 'by_date'>];
  return new Date(now.getTime() - days * DAY_MS);
}

/** When an outstanding question pauses the case if nobody answers (null =
 * no question out, or already paused). The client's screens show this date:
 * «Если не ответите до …, кейс скроется из ленты адвокатов». */
export function pauseDueAt(f: StaleFacts, timers: StaleTimers): Date | null {
  if (f.pausedAt || !questionOutstanding(f) || !f.promptSentAt) return null;
  const kind = staleKind(f.urgency, f.deadlineAt);
  const days = timers.pauseDays[kind];
  if (kind === 'by_date' && f.deadlineAt) {
    return new Date(
      Math.max(
        f.deadlineAt.getTime() + days * DAY_MS,
        f.promptSentAt.getTime() + MIN_GRACE_AFTER_QUESTION_MS,
      ),
    );
  }
  return new Date(f.promptSentAt.getTime() + days * DAY_MS);
}

/** Pause now? A question is out, nothing happened since, and the grace
 * has run out. */
export function shouldPause(
  f: StaleFacts,
  timers: StaleTimers,
  now: Date,
): boolean {
  const at = pauseDueAt(f, timers);
  return at !== null && now.getTime() >= at.getTime();
}

/** When a paused case is archived (null = not paused). */
export function archiveDueAt(
  f: Pick<StaleFacts, 'pausedAt'>,
  timers: StaleTimers,
): Date | null {
  return f.pausedAt
    ? new Date(f.pausedAt.getTime() + timers.archiveAfterPauseDays * DAY_MS)
    : null;
}

/** Archive a paused case now? */
export function shouldArchive(
  f: Pick<StaleFacts, 'pausedAt'>,
  timers: StaleTimers,
  now: Date,
): boolean {
  return (
    f.pausedAt !== null &&
    now.getTime() >=
      f.pausedAt.getTime() + timers.archiveAfterPauseDays * DAY_MS
  );
}

/** «Сменить на «Не срочно»»: only for urgent / very urgent cases older
 * than a week. */
export function canMakeNotUrgent(
  urgency: string | null,
  createdAt: Date,
  now: Date,
): boolean {
  return (
    (urgency === 'urgent' || urgency === 'very_urgent') &&
    now.getTime() - createdAt.getTime() > MAKE_NOT_URGENT_AFTER_DAYS * DAY_MS
  );
}

/** Local hour (0–23) of [now] in [timeZone]; null for an unknown zone. */
function localHour(now: Date, timeZone: string): number | null {
  try {
    const h = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .find((p) => p.type === 'hour')?.value;
    return h === undefined ? null : Number(h);
  } catch {
    return null;
  }
}

/** 09:00–21:00 in the client's time zone (their own, else US Eastern). */
export function isClientDaytime(
  now: Date,
  timeZone: string | null | undefined,
): boolean {
  const hour =
    localHour(now, timeZone || DEFAULT_ASK_TIMEZONE) ??
    localHour(now, DEFAULT_ASK_TIMEZONE);
  return hour !== null && hour >= ASK_FROM_HOUR && hour < ASK_TO_HOUR;
}
