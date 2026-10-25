import type Redis from 'ioredis';
import { CircuitBreaker } from '../common/resilience/resilience';

/** What a failed cache command answers (a miss / nothing done). */
const FALLBACK: Record<string, unknown> = {
  get: null,
  mget: null,
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
};

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
        typeof value !== 'function' ||
        typeof prop !== 'string' ||
        !(prop in FALLBACK)
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
          return FALLBACK[prop];
        }
      };
    },
  });
}
