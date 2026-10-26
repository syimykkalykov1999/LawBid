/**
 * Per-minute request limits (docs/06_PRODUCTION.md, «Лимиты запросов»).
 * Users, assistants and anonymous callers share USER_THROTTLE_DEFAULT per
 * tracker; a signed-in admin gets ADMIN_THROTTLE_DEFAULT, editable in
 * admin Система → Настройки (`security.admin_rate_limit_per_minute`).
 */
export const USER_THROTTLE_DEFAULT = 100;
export const ADMIN_THROTTLE_DEFAULT = 600;
export const ADMIN_THROTTLE_MIN = 100;
export const ADMIN_THROTTLE_MAX = 10_000;
/**
 * How long an admin stays blocked after going over the limit. The window
 * counter still refuses until the minute ends, so the wait is at most
 * about a minute.
 */
export const ADMIN_BLOCK_MS = 5_000;

/** A positive integer from an env var, else undefined. */
export function envLimit(raw: string | undefined): number | undefined {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** `THROTTLE_LIMIT` (dev machines only) or the default for users. */
export function userThrottleLimit(env = process.env.THROTTLE_LIMIT): number {
  return envLimit(env) ?? USER_THROTTLE_DEFAULT;
}

/**
 * The admin limit: `ADMIN_THROTTLE_LIMIT` when set (the way back in after
 * a bad save), else the setting clamped to [MIN, MAX], never below the
 * user limit.
 */
export function adminThrottleLimit(
  fromSettings: number,
  env: string | undefined,
): number {
  const override = envLimit(env);
  if (override !== undefined) return override;
  const value = Number.isFinite(fromSettings)
    ? Math.round(fromSettings)
    : ADMIN_THROTTLE_DEFAULT;
  const clamped = Math.min(
    ADMIN_THROTTLE_MAX,
    Math.max(ADMIN_THROTTLE_MIN, value),
  );
  return Math.max(clamped, userThrottleLimit());
}
