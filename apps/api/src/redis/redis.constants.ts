export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * Batch C item 9 (2026-10-24): the client for pure caches (values that are
 * only copies of something recomputable, always with a TTL). It points to a
 * separate Redis (`REDIS_CACHE_URL`, eviction policy allkeys-lru) so cache
 * keys can never fill the queue Redis (noeviction), and falls back to the
 * main Redis while `REDIS_CACHE_URL` is unset. It fails soft: a dead cache
 * is a miss, never an error.
 *
 * NEVER use it for: queues/locks, rate limits, throttles, OTP, sessions,
 * idempotency keys, counters, version numbers, cost guard, pub/sub. Those
 * stay on REDIS_CLIENT; an eviction there would be a correctness bug.
 */
export const REDIS_CACHE_CLIENT = Symbol('REDIS_CACHE_CLIENT');
