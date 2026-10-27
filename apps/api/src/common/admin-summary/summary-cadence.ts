import type { TriMode } from '../ops/tri-mode';

/** An admin request seen within this window counts as "someone is looking". */
export const ADMIN_ACTIVE_WINDOW_SEC = 10 * 60;
const MIN_MS = 60_000;
/** Authorised work every 2 minutes (the cron tick) while someone looks. */
const LIVE_EVERY_MS = 0;
/** Nobody is looking: refresh hourly so the next visit is still fresh. */
const IDLE_EVERY_MS = 60 * MIN_MS;
/** Switch Выкл: only the slow safety net (the nightly snapshot logic and
 * the manual button do the real work). */
const OFF_EVERY_MS = 6 * 60 * MIN_MS;
/** The cron tick jitters by a few seconds; do not skip a tick for that. */
const SLACK_MS = 5_000;

/**
 * S20-1 (2026-10-25): how often the heavy admin aggregates are recounted.
 * Вкл = every tick (every 2 minutes, as before). Авто = every tick only
 * while an admin request was seen in the last 10 minutes, else hourly.
 * Выкл = every 6 hours. Pure, so it is tested without Redis.
 */
export function adminSummariesDue(input: {
  mode: TriMode;
  adminActive: boolean;
  lastRunAt: string | null | undefined;
  now?: Date;
}): boolean {
  const interval =
    input.mode === 'on'
      ? LIVE_EVERY_MS
      : input.mode === 'off'
        ? OFF_EVERY_MS
        : input.adminActive
          ? LIVE_EVERY_MS
          : IDLE_EVERY_MS;
  if (interval === 0) return true;
  const last = input.lastRunAt ? Date.parse(input.lastRunAt) : NaN;
  if (!Number.isFinite(last)) return true;
  const age = (input.now ?? new Date()).getTime() - last;
  if (age < 0) return true;
  return age + SLACK_MS >= interval;
}
