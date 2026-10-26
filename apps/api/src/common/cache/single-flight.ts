/**
 * Load audit 6 (2026-10-23): cache stampede protection.
 *
 * When a hot cache key expires, every request that arrives before the first
 * one has refilled it runs the same expensive query: at 10 000 requests a
 * second for a feed page, one expiry is thousands of identical database
 * reads in the same instant. Big platforms (Facebook's "leases", Instagram's
 * Memcache tier) let ONE caller refill and make the rest wait. Two parts:
 *
 * - [singleFlight]: callers in the same process asking for the same key
 *   share one in-flight load (a pod with 500 waiting requests asks the
 *   database once).
 * - [jitterTtl]: expiry is spread over +/-[spread] so keys written together
 *   (a deploy, a flush) do not all expire in the same second.
 */
const inflight = new Map<string, Promise<unknown>>();

export function singleFlight<T>(
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const p = load().finally(() => {
    if (inflight.get(key) === p) inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
}

/** [ttlSec] spread by +/-[spread] (default 20 %), at least 1 s. */
export function jitterTtl(
  ttlSec: number,
  spread = 0.2,
  random: () => number = Math.random,
): number {
  const f = 1 - spread + random() * 2 * spread;
  return Math.max(1, Math.round(ttlSec * f));
}

/** Number of loads running right now (tests / metrics). */
export function inflightCount(): number {
  return inflight.size;
}
