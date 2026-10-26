import type { ErrorEvent } from '@sentry/nestjs';

/**
 * Cost registry V9 (owner 2026-10-25): a crash loop can send the same error
 * thousands of times a minute and eat the whole monthly Sentry quota in an
 * hour. This wraps `beforeSend` with two ceilings per process, counted in
 * one-minute windows: at most `perErrorPerMinute` copies of the same error
 * and `totalPerMinute` events of any kind. Dropped events are not lost for
 * debugging: the log line of the error stays in CloudWatch.
 */
export interface SentryThrottleOptions {
  perErrorPerMinute?: number;
  totalPerMinute?: number;
  /** Test hook. */
  now?: () => number;
}

export function eventKey(e: ErrorEvent): string {
  const ex = e.exception?.values?.[0];
  const frame = ex?.stacktrace?.frames?.at(-1);
  return [
    ex?.type ?? '',
    (ex?.value ?? e.message ?? '').slice(0, 120),
    frame?.filename ?? '',
    frame?.lineno ?? '',
  ].join('|');
}

export function throttledBeforeSend(
  inner: (event: ErrorEvent) => ErrorEvent | null,
  opts: SentryThrottleOptions = {},
): (event: ErrorEvent) => ErrorEvent | null {
  const perError = opts.perErrorPerMinute ?? 5;
  const total = opts.totalPerMinute ?? 120;
  const now = opts.now ?? Date.now;
  let windowStart = 0;
  let sent = 0;
  const seen = new Map<string, number>();
  return (event) => {
    const t = now();
    if (t - windowStart >= 60_000) {
      windowStart = t;
      sent = 0;
      seen.clear();
    }
    const out = inner(event);
    if (!out) return null;
    const key = eventKey(out);
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n > perError || sent >= total) return null;
    sent += 1;
    return out;
  };
}
