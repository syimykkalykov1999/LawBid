import type Redis from 'ioredis';
import { jitterTtl, singleFlight } from './single-flight';

/**
 * Owner 2026-10-25 (caching round 2, S2-6): ONE read-through cache helper
 * for the hot keys, replacing hand-written get / load / set code.
 *
 *   GET key -> hit: return
 *           -> miss: singleFlight (one load per process)
 *                    -> short Redis lease `key:lease` (SET NX EX): one pod
 *                       in the cluster reloads, the others wait a moment
 *                       and read the value it wrote (Facebook's memcache
 *                       "lease" against a stampede after a deploy or flush)
 *                    -> loader -> SET key EX ttl +/- jitter
 *
 * Fail soft: every Redis problem (down, timeout, bad JSON) is a miss and
 * the loader runs; the lease wait is bounded (default 60 ms), so a dead
 * cache costs a few milliseconds, never an error. Use it with the cache
 * client (REDIS_CACHE_CLIENT, fail-soft), never for correctness state.
 */
export interface CachedOptions<T> {
  /** Lifetime in seconds, spread by `jitter`. */
  ttlSec: number;
  /** +/- fraction of the TTL (default 0.2). */
  jitter?: number;
  /** Lease length in seconds (default 5); 0 = no cross-pod lease. */
  leaseSec?: number;
  /** Longest wait for the lease holder to fill the key (default 60 ms). */
  leaseWaitMs?: number;
  /** Text stored in Redis; default JSON. */
  serialize?: (value: T) => string;
  /** Inverse of `serialize`; may throw on garbage (= a miss). */
  parse?: (raw: string) => T;
}

/** Admin ceiling `cache.max_ttl_sec` on every `cached()` lifetime (0 = no
 * ceiling). Set by CacheRedisModeService from the setting. */
let ttlCeilingSec = 0;
export function setCacheTtlCeiling(sec: number): void {
  ttlCeilingSec = Number.isFinite(sec) && sec > 0 ? sec : 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function cached<T>(
  redis: Redis,
  key: string,
  opts: CachedOptions<T>,
  loader: () => Promise<T>,
): Promise<T> {
  const parse = opts.parse ?? ((raw: string) => JSON.parse(raw) as T);
  const serialize = opts.serialize ?? ((v: T) => JSON.stringify(v));
  const read = async (): Promise<{ hit: boolean; value?: T }> => {
    try {
      const raw = await redis.get(key);
      if (raw !== null && raw !== undefined) {
        return { hit: true, value: parse(raw) };
      }
    } catch {
      // miss
    }
    return { hit: false };
  };

  const first = await read();
  if (first.hit) return first.value as T;

  return singleFlight(`cached:${key}`, async () => {
    // Another caller of this process may have filled it meanwhile.
    const again = await read();
    if (again.hit) return again.value as T;

    const leaseSec = opts.leaseSec ?? 5;
    const leaseKey = `${key}:lease`;
    let holdsLease = false;
    if (leaseSec > 0) {
      try {
        holdsLease =
          (await redis.set(leaseKey, '1', 'EX', leaseSec, 'NX')) === 'OK';
      } catch {
        holdsLease = false;
      }
      if (!holdsLease) {
        // Someone else (another pod) is loading: wait briefly for its value.
        const waitMs = opts.leaseWaitMs ?? 60;
        const step = Math.max(10, Math.floor(waitMs / 3));
        for (let waited = 0; waited < waitMs; waited += step) {
          await sleep(step);
          const filled = await read();
          if (filled.hit) return filled.value as T;
        }
      }
    }
    try {
      const value = await loader();
      try {
        await redis.set(
          key,
          serialize(value),
          'EX',
          jitterTtl(
            ttlCeilingSec > 0
              ? Math.min(opts.ttlSec, ttlCeilingSec)
              : opts.ttlSec,
            opts.jitter ?? 0.2,
          ),
        );
      } catch {
        // best effort
      }
      return value;
    } finally {
      if (holdsLease) {
        try {
          await redis.del(leaseKey);
        } catch {
          // the lease expires by itself
        }
      }
    }
  });
}
