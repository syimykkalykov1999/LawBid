import { ApiError } from '@/lib/api/client';

/** At most this many retries after the first try (4 tries in all). */
export const QUERY_MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 15_000;

/**
 * Retry rule of every admin query (owner 2026-10-23, "связь пропала"):
 * a failed request is a hiccup, not an "offline" state. Retried: network
 * errors (a `TypeError` from fetch) and 5xx (the proxy answers 502/504
 * when the API restarts). Never retried: any 4xx — 401 redirects, 403 is
 * final, 429 would only dig the rate-limit hole deeper.
 */
export function shouldRetryQuery(count: number, error: unknown): boolean {
  if (count >= QUERY_MAX_RETRIES) return false;
  if (error instanceof ApiError) return error.status >= 500;
  return true;
}

/** Exponential backoff 1 s, 2 s, 4 s … capped at 15 s, with jitter
 * (x0.5–x1.0) so many tabs do not come back in the same second. */
export function queryRetryDelay(
  attempt: number,
  random: () => number = Math.random,
): number {
  const base = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
  return Math.round(base * (0.5 + random() * 0.5));
}
