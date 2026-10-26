import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';

/** Releases the lock only if this holder still owns it (compare-and-del). */
const RELEASE = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0`;

/** Extends the lock only if this holder still owns it (compare-and-pexpire). */
export const RENEW = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0`;

export interface JobLockContext {
  /** Aborted when the lock was lost (expired or taken over). A cooperative
   * `fn` checks it and stops; `withJobLock` itself stops waiting for it. */
  signal: AbortSignal;
}

/**
 * docs/04 §10.2: "защищены от параллельного запуска блокировкой в Redis".
 * Runs `fn` only if the named lock is free (SET NX PX); otherwise returns
 * null and does nothing. The TTL bounds a crashed holder.
 *
 * S6-7 (Kleppmann, «How to do distributed locking»): a TTL lock needs a
 * heartbeat. While `fn` runs the lock is renewed at 1/3 of the TTL
 * (PEXPIRE only if the token is still ours), so a slow sweep (DB under
 * load, exactly when it runs long) never lets a second pod start. If a
 * renewal finds the lock gone, `ctx.signal` is aborted and `null` is
 * returned at once (the work is idempotent; a later result of `fn` is
 * dropped). A Redis error during renewal is not a loss: the next tick
 * retries, the TTL still bounds it.
 */
export async function withJobLock<T>(
  redis: Redis,
  name: string,
  ttlMs: number,
  fn: (ctx: JobLockContext) => Promise<T>,
): Promise<T | null> {
  const key = `lock:job:${name}`;
  const token = randomUUID();
  if ((await redis.set(key, token, 'PX', ttlMs, 'NX')) !== 'OK') return null;
  const abort = new AbortController();
  let onLost: () => void = () => undefined;
  const lost = new Promise<null>((resolve) => {
    onLost = () => resolve(null);
  });
  const timer = setInterval(
    () => {
      void (async () => {
        try {
          const kept = await redis.eval(RENEW, 1, key, token, ttlMs);
          if (Number(kept) === 0 && !abort.signal.aborted) {
            abort.abort();
            onLost();
          }
        } catch {
          // transient Redis error: try again next tick
        }
      })();
    },
    Math.max(1, Math.floor(ttlMs / 3)),
  );
  timer.unref();
  try {
    return await Promise.race([fn({ signal: abort.signal }), lost]);
  } finally {
    clearInterval(timer);
    await redis.eval(RELEASE, 1, key, token);
  }
}
