import type { IncomingMessage } from 'node:http';

/**
 * Owner 2026-10-22 (server load audit, finding 1): pino-http used to write
 * one line per request with the whole request object (headers included).
 * At a million daily users that is terabytes of CloudWatch a month. Now a
 * request is logged only when it failed (status ≥ 400 or an error), when it
 * was slow, or when it falls in a small random sample — and the line is
 * compact: method, url (query values and secret path parts removed),
 * status, time, request id and the user id. Errors are always logged.
 */
export interface HttpLogPolicy {
  /** Share (%) of the ordinary — fast, successful — requests logged. */
  samplePercent: number;
  /** A request slower than this many ms is always logged. */
  slowMs: number;
}

export const DEFAULT_HTTP_LOG_POLICY: HttpLogPolicy = {
  samplePercent: 1,
  slowMs: 1000,
};

/** HTTP_LOG_SAMPLE_PERCENT (0–100, default 1) and HTTP_LOG_SLOW_MS
 * (default 1000) — validated by env.schema.ts; anything unreadable here
 * falls back to the default instead of failing a request. */
export function httpLogPolicyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): HttpLogPolicy {
  const num = (raw: string | undefined, fallback: number): number => {
    if (raw === undefined || raw.trim() === '') return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    samplePercent: Math.min(
      100,
      num(env.HTTP_LOG_SAMPLE_PERCENT, DEFAULT_HTTP_LOG_POLICY.samplePercent),
    ),
    slowMs: num(env.HTTP_LOG_SLOW_MS, DEFAULT_HTTP_LOG_POLICY.slowMs),
  };
}

export type HttpLogLevel = 'error' | 'warn' | 'info' | 'silent';

/**
 * The level of a finished request's line, `silent` = not written: an error
 * or 5xx → error, 4xx or slow → warn, otherwise info for the sampled share.
 * [random] returns [0, 1) (Math.random; tests pass their own).
 */
export function httpLogLevel(
  statusCode: number,
  responseTimeMs: number,
  failed: boolean,
  policy: HttpLogPolicy,
  random: () => number = Math.random,
): HttpLogLevel {
  if (failed || statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warn';
  if (responseTimeMs >= policy.slowMs) return 'warn';
  if (policy.samplePercent <= 0) return 'silent';
  return random() * 100 < policy.samplePercent ? 'info' : 'silent';
}

/** Secret path parts: the Bunny webhook token, an admin invite token and a
 * group's join code. */
const SECRET_PATHS: [RegExp, string][] = [
  [/\/webhooks\/bunny\/[^/?#]+/, '/webhooks/bunny/[REDACTED]'],
  [/\/auth\/invite\/[^/?#]+/, '/auth/invite/[REDACTED]'],
  [/\/groups\/join\/[^/?#]+/, '/groups/join/[REDACTED]'],
];

/** The url with every query value dropped (only the names stay — docs/05
 * §7.6: search text is never logged) and secret path parts redacted. */
export function safeUrl(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  const q = url.indexOf('?');
  let path = q === -1 ? url : url.slice(0, q);
  for (const [re, to] of SECRET_PATHS) path = path.replace(re, to);
  if (q === -1) return path;
  const names = url
    .slice(q + 1)
    .split('&')
    .map((pair) => pair.split('=')[0])
    .filter((name) => name.length > 0);
  return names.length > 0 ? `${path}?${names.join('&')}` : path;
}

/** The compact `req` of a log line: no headers, body, query or address. */
export function compactReq(req: {
  id?: unknown;
  method?: string;
  url?: string;
}): { id?: unknown; method?: string; url?: string } {
  return { id: req.id, method: req.method, url: safeUrl(req.url) };
}

/** The compact `res`: the status only (no response headers). */
export function compactRes(res: { statusCode?: number }): {
  statusCode?: number;
} {
  return { statusCode: res.statusCode };
}

/** `userId` once the auth guard has run — pino-http reads customProps
 * again when the response finishes. */
export function requestUserProps(req: IncomingMessage & { userId?: unknown }): {
  userId?: string;
} {
  return typeof req.userId === 'string' ? { userId: req.userId } : {};
}
