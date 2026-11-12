/**
 * Per-minute request limits (docs/06_PRODUCTION.md, «Лимиты запросов»).
 * Users, assistants and anonymous callers share USER_THROTTLE_DEFAULT per
 * tracker; a signed-in admin gets ADMIN_THROTTLE_DEFAULT, editable in
 * admin Система → Настройки (`security.admin_rate_limit_per_minute`).
 * Owner 2026-11-12 («нигде с лимитами не ограничивай меня»): 0 = no limit
 * for signed-in admins, the default; his 2FA code is the guard on his own
 * actions. The setting stays, so a number can be set again later.
 */
export const USER_THROTTLE_DEFAULT = 100;
export const ADMIN_THROTTLE_DEFAULT = 0;
export const ADMIN_THROTTLE_MIN = 0;
export const ADMIN_THROTTLE_MAX = 1_000_000;
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
 * `THROTTLE_IGNORE_USER_AGENT` (test machines and the CI perf guard only,
 * never set on a production container): requests whose User-Agent header is
 * EXACTLY this string skip every rate limit, the global one and a route's
 * own `@Throttle`. It is @nestjs/throttler's own `ignoreUserAgents` option
 * (docs.nestjs.com/security/rate-limiting); the perf guard
 * (test/perf-user.e2e-spec.ts) sets it to a value unique to the run so
 * only its client is exempt and every other caller keeps the limits.
 * Unset = nothing is ignored.
 */
export function throttleIgnoreUserAgents(
  env = process.env.THROTTLE_IGNORE_USER_AGENT,
): RegExp[] {
  const ua = env?.trim();
  if (!ua) return [];
  return [new RegExp(`^${ua.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)];
}

/**
 * The admin limit: `ADMIN_THROTTLE_LIMIT` when set (the way back in after
 * a bad save), else the setting clamped to [MIN, MAX], never below the
 * user limit. 0 (the default) = no limit for admins.
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
  if (value <= 0) return 0;
  const clamped = Math.min(
    ADMIN_THROTTLE_MAX,
    Math.max(ADMIN_THROTTLE_MIN, value),
  );
  return Math.max(clamped, userThrottleLimit());
}
