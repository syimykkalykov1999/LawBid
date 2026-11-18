import type Redis from 'ioredis';
import { delSafe } from '../../redis/redis-cluster-safe';

/** S1-4: cached "may [viewer] see [target]'s status" answer (REDIS_CLIENT). */
export const presencePermKey = (viewerId: string, targetId: string) =>
  `presence:perm:${viewerId}:${targetId}`;

/**
 * Verify batch 7 (BL2, 2026-11-17): a block (or unblock) between [a] and
 * [b] changes who may watch whom, so both cached answers go at once; the
 * next announcement asks again and drops a watcher across a block.
 * Best-effort: the cached answer lives only a short while anyway.
 */
export async function dropPresencePerms(
  redis: Redis,
  a: string,
  b: string,
): Promise<void> {
  await delSafe(redis, [presencePermKey(a, b), presencePermKey(b, a)]).catch(
    () => undefined,
  );
}
