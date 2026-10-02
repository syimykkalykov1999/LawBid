/**
 * Owner 2026-10-02: waits after wrong or too many verification codes stay
 * short. After 5 wrong codes: 1 minute, then 3 minutes, then 30 minutes —
 * and 30 minutes is the most, never an hour, never days. A correct code
 * resets the ladder. The rate-limit windows for asking for / checking
 * codes use the same longest wait, so nobody is ever told to come back
 * in more than half an hour.
 */
export const OTP_LOCKOUT_SCHEDULE_SECONDS: readonly number[] = [60, 180, 1800];

/** How long a lock ladder step is remembered after the last lock. */
export const OTP_LOCKOUT_MEMORY_SECONDS = 24 * 3600;

/** Window of the request / verify rate limits (the longest wait). */
export const OTP_LIMIT_WINDOW_SECONDS: number =
  OTP_LOCKOUT_SCHEDULE_SECONDS[OTP_LOCKOUT_SCHEDULE_SECONDS.length - 1];
