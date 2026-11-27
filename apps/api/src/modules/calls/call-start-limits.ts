/**
 * 26.11 (call spam): what limits starting a 1:1 call, besides the general
 * message budget. Values are admin settings (owner 13.11: no hard-coded
 * limits), 0 = off:
 *  - `calls.start_rate_limit_per_minute` / `_per_day`: call starts per
 *    person (a fixed window each, UsageLimitsService.consumeSetting);
 *  - `calls.unanswered_in_row_limit` + `calls.unanswered_cooldown_minutes`:
 *    after N unanswered rings in a row to the same person, the next ring to
 *    them waits the cooldown. The idea is WhatsApp's Business Calling rule
 *    (two unanswered calls in a row = a reminder, four = the permission to
 *    call is revoked); here it is a pause, not a ban, and it ends by itself.
 * Admins are never capped (UserThrottlerGuard does the same for `a:`).
 */
export const CALL_START_PER_MINUTE = 'calls.start_rate_limit_per_minute';
export const CALL_START_PER_DAY = 'calls.start_rate_limit_per_day';
export const UNANSWERED_IN_ROW = 'calls.unanswered_in_row_limit';
export const UNANSWERED_COOLDOWN_MIN = 'calls.unanswered_cooldown_minutes';

/** A ring that reached the other person and was not taken. */
const UNANSWERED = new Set(['missed', 'declined', 'canceled']);
/** Never rang the other person: neither counts nor breaks the row. */
const NEUTRAL = new Set(['busy', 'failed']);

export interface StreakRow {
  caller_id: string;
  status: string;
  answered_at: Date | null;
  created_at: Date;
}

/**
 * The newest calls of one 1:1 chat (newest first) → how many unanswered
 * rings in a row [callerId] made, and when the newest of them was made.
 * A call from the other person (a call back) or any answered call ends the
 * row; busy / failed starts are skipped; a live call ends it too.
 */
export function unansweredInRow(
  rows: readonly StreakRow[],
  callerId: string,
): { count: number; lastAt: Date | null } {
  let count = 0;
  let lastAt: Date | null = null;
  for (const r of rows) {
    if (r.caller_id !== callerId || r.answered_at) break;
    if (NEUTRAL.has(r.status)) continue;
    if (!UNANSWERED.has(r.status)) break;
    count += 1;
    lastAt ??= r.created_at;
  }
  return { count, lastAt };
}

/**
 * Seconds the next ring must still wait (0 = it may ring now).
 * [limit] 0 = off; [cooldownMin] 0 = no wait.
 */
export function unansweredWaitSeconds(
  row: { count: number; lastAt: Date | null },
  limit: number,
  cooldownMin: number,
  now = Date.now(),
): number {
  if (!(limit > 0) || !(cooldownMin > 0) || row.count < limit) return 0;
  if (!row.lastAt) return 0;
  const until = row.lastAt.getTime() + cooldownMin * 60_000;
  return until > now ? Math.ceil((until - now) / 1000) : 0;
}
