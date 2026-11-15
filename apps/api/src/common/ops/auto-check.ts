/**
 * 15.11 (live tests of «Авто» within 10 minutes): how often the cloud
 * automation (infra-auto.service) and the HA copies (ha-auto.service) look.
 * Admin → Настройки `infra.auto_check_minutes` (default 10, floor 1 minute,
 * no ceiling). Read before every pass, so a change acts from the next pass
 * without a restart.
 */
export const AUTO_CHECK_DEFAULT_MINUTES = 10;

/** The pause between two passes in ms (junk / 0 = the default). */
export function autoCheckMs(minutes: number | undefined): number {
  const m =
    minutes !== undefined && Number.isFinite(minutes) && minutes > 0
      ? minutes
      : AUTO_CHECK_DEFAULT_MINUTES;
  return Math.max(1, m) * 60_000;
}

/** The pass lock lives a little shorter than the pause (9 min of 10 as
 * before), at least 30 s, so the next pass of any task can take it. */
export function autoLockTtlS(checkMs: number): number {
  return Math.max(30, Math.floor(checkMs / 1000) - 60);
}
