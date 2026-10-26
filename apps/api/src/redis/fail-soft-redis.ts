import type Redis from 'ioredis';
import { CircuitBreaker } from '../common/resilience/resilience';

/** What a failed cache command answers (a miss / nothing done). */
const FALLBACK: Record<string, unknown> = {
  get: null,
  set: null,
  setex: null,
  del: 0,
  unlink: 0,
  expire: 0,
  exists: 0,
  ttl: -2,
  getdel: null,
  hget: null,
  hgetall: {},
  hset: 0,
  hdel: 0,
  sadd: 0,
  srem: 0,
  smembers: [],
  // S6-10: more commands a cache caller can use; each answers "nothing".
  incr: 0,
  incrby: 0,
  pexpire: 0,
  pttl: -2,
  zscore: null,
  zadd: 0,
  zrem: 0,
};

/** Fallbacks that depend on the call: a miss for N keys is N nulls (callers
 * index the result), never a bare `null`. */
const FALLBACK_FN: Record<string, (args: unknown[]) => unknown> = {
  mget: (args) => nulls(Array.isArray(args[0]) ? args[0].length : args.length),
  // hmget(key, f1, f2) / hmget(key, [f1, f2])
  hmget: (args) =>
    nulls(Array.isArray(args[1]) ? args[1].length : args.length - 1),
};

function nulls(n: number): null[] {
  return Array.from({ length: Math.max(0, n) }, () => null);
}

/** A pipeline/multi on a failing cache: queueing works, `exec()` answers
 * "no replies" (a no-op) instead of throwing. */
function softPipeline(
  pipe: object,
  breaker: CircuitBreaker,
  onError?: (command: string, error: unknown) => void,
): object {
  return new Proxy(pipe, {
    get(t, prop, r) {
      const v = Reflect.get(t, prop, r) as unknown;
      if (typeof v !== 'function') return v;
      if (prop === 'exec') {
        return async () => {
          try {
            return await breaker.run(() =>
              (v as () => Promise<unknown>).call(t),
            );
          } catch (e) {
            onError?.('pipeline', e);
            return [];
          }
        };
      }
      // chainable calls return the pipeline itself: keep wrapping it
      return (...a: unknown[]) => {
        const res = (v as (...x: unknown[]) => unknown).apply(t, a);
        return (res === t ? r : res) as unknown;
      };
    },
  });
}

/**
 * Wraps a Redis client used as a cache: a failing command (down, timeout)
 * answers like a cache miss instead of throwing, and after a few failures
 * in a row the client is skipped for 10 s so a dead cache node costs
 * nothing per request. Commands outside the list pass through unchanged.
 */
export function failSoftRedis(
  client: Redis,
  onError?: (command: string, error: unknown) => void,
  breaker: CircuitBreaker = new CircuitBreaker('redis_cache', {
    threshold: 3,
    openMs: 10_000,
  }),
): Redis {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (
        typeof value === 'function' &&
        (prop === 'pipeline' || prop === 'multi')
      ) {
        return (...args: unknown[]) =>
          softPipeline(
            (value as (...a: unknown[]) => object).apply(target, args),
            breaker,
            onError,
          );
      }
      if (
        typeof value !== 'function' ||
        typeof prop !== 'string' ||
        !(prop in FALLBACK || prop in FALLBACK_FN)
      ) {
        return typeof value === 'function'
          ? (value as (...a: unknown[]) => unknown).bind(target)
          : value;
      }
      return async (...args: unknown[]) => {
        try {
          return await breaker.run(() =>
            (value as (...a: unknown[]) => Promise<unknown>).apply(
              target,
              args,
            ),
          );
        } catch (e) {
          onError?.(prop, e);
          return prop in FALLBACK_FN ? FALLBACK_FN[prop](args) : FALLBACK[prop];
        }
      };
    },
  });
}
