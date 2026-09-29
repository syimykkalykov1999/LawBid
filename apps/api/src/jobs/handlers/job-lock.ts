import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';

/** Releases the lock only if this holder still owns it (compare-and-del). */
const RELEASE = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0`;

/**
 * docs/04 §10.2: "защищены от параллельного запуска блокировкой в Redis".
 * Runs `fn` only if the named lock is free (SET NX PX); otherwise returns
 * null and does nothing. The TTL bounds a crashed holder.
 */
export async function withJobLock<T>(
  redis: Redis,
  name: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  const key = `lock:job:${name}`;
  const token = randomUUID();
  if ((await redis.set(key, token, 'PX', ttlMs, 'NX')) !== 'OK') return null;
  try {
    return await fn();
  } finally {
    await redis.eval(RELEASE, 1, key, token);
  }
}
