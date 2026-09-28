import type Redis from 'ioredis';

/**
 * Atomic "send once" claim for a reminder (SET key 1 NX EX ttl): of two
 * overlapping job runs that both read the same reminder as due (the
 * notifications NOT EXISTS read races with the other run's insert), only
 * the one that wins the claim emits it. The notifications check stays
 * the durable de-dup; this closes the window between read and insert.
 * `ttlSeconds` must outlive the reminder's eligibility window.
 */
export async function claimReminder(
  redis: Redis,
  key: string,
  ttlSeconds: number,
): Promise<boolean> {
  return (await redis.set(key, '1', 'EX', ttlSeconds, 'NX')) === 'OK';
}

/** Emits under a claim; the claim is released if the emit fails so a
 * retry can send it. Returns false when another run holds the claim. */
export async function emitOnce(
  redis: Redis,
  key: string,
  ttlSeconds: number,
  emit: () => Promise<unknown>,
): Promise<boolean> {
  if (!(await claimReminder(redis, key, ttlSeconds))) return false;
  try {
    await emit();
  } catch (err) {
    await redis.del(key);
    throw err;
  }
  return true;
}
