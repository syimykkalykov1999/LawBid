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

/**
 * Owner 2026-10-07: daily cap of codes sent to one phone / e-mail
 * (rolling 24 h, sliding window like the hourly per-identifier limit).
 * Admin setting `security.otp_per_identifier_per_day`, else the env
 * OTP_RATE_LIMIT_PER_IDENTIFIER_PER_DAY. This window is longer than the
 * half-hour waits above on purpose: it only bites after a day's worth of
 * codes, which a person signing in never reaches.
 */
export const OTP_DAILY_WINDOW_SECONDS = 24 * 3600;
export const OTP_DAILY_LIMIT_MIN = 1;
export const OTP_DAILY_LIMIT_MAX = 1000;

/** The daily cap: the admin's saved value when it is a whole number in
 * [MIN, MAX], else the env fallback. Never 0 / unlimited. */
export function otpDailyLimit(stored: number | null, envValue: number): number {
  if (
    stored !== null &&
    Number.isInteger(stored) &&
    stored >= OTP_DAILY_LIMIT_MIN &&
    stored <= OTP_DAILY_LIMIT_MAX
  ) {
    return stored;
  }
  return envValue;
}
