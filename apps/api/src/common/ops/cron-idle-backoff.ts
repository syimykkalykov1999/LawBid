import type { TriMode } from './tri-mode';

/**
 * S20-6 (2026-10-25): sweeps that tick every minute and are idle for days
 * (a government export, the search outbox, video processing, consultation
 * reminders) back off to a slower pace while there is nothing to do and go
 * back to every minute the moment work appears.
 *
 * Not listed on purpose (a late tick is felt by people or by the alarms):
 * calls.sweep, chat.redeliver, outbox.sweep, ops.guard, status.watchdog,
 * ops.queue-metrics (monitoring), tasks.reminders (exact reminder times).
 */
export interface IdleState {
  /** Consecutive runs that found nothing to do. */
  empty: number;
  lastRunAt: string;
}

/**
 * A run found nothing to do when its result carries no positive number, no
 * truthy id/flag, and is not an error. `{skipped: ...}`, `null`, `{}` and
 * `{built: null, expired: 0}` are idle. Anything we cannot read (a bare
 * number, an array with items, a string) counts as work, so we never slow
 * a job down on a guess.
 */
export function isIdleResult(result: unknown): boolean {
  if (result === null || result === undefined) return true;
  if (typeof result !== 'object' || Array.isArray(result)) {
    return Array.isArray(result) && result.length === 0;
  }
  for (const [key, value] of Object.entries(result)) {
    if (key === 'skipped') continue;
    if (value === null || value === undefined || value === false) continue;
    if (typeof value === 'number' && !(value > 0)) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    return false;
  }
  return true;
}

/** The state after one more finished run. */
export function nextIdleState(
  prev: IdleState | null,
  idle: boolean,
  now: Date,
): IdleState {
  return {
    empty: idle ? (prev?.empty ?? 0) + 1 : 0,
    lastRunAt: now.toISOString(),
  };
}

/**
 * Should this tick be skipped? Выкл: never (every minute, as before).
 * Вкл: always at the slow pace. Авто: slow only after `afterRuns` empty runs
 * in a row. A skipped tick costs one BullMQ cycle and no queries.
 */
export function shouldSkipTick(input: {
  mode: TriMode;
  state: IdleState | null;
  afterRuns: number;
  everyMs: number;
  now?: Date;
}): boolean {
  if (input.mode === 'off' || !input.state) return false;
  if (input.mode === 'auto' && input.state.empty < input.afterRuns) {
    return false;
  }
  const last = Date.parse(input.state.lastRunAt);
  if (!Number.isFinite(last)) return false;
  const age = (input.now ?? new Date()).getTime() - last;
  // 5 s of slack: the cron tick jitters, do not lose a whole slow period.
  return age >= 0 && age + 5_000 < input.everyMs;
}
