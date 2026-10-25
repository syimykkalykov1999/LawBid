import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import { cached } from '../../common/cache/cached';

/**
 * Owner 2026-10-18 (speed): every feed page, reels page and People search
 * asked the database for the viewer's block set up to three times. The set
 * (both directions, as a JSON array of user ids) now lives in Redis for a
 * minute under `blocks:{uid}`. BlocksService.block / unblock delete the key
 * for BOTH users, so a new block or unblock applies at once; the TTL only
 * covers a Redis hiccup. Any Redis failure falls back to the query.
 *
 * Caching round 2 (S2-2 / S2-6): it is a per-user cache, so the callers pass
 * the CACHE Redis client (REDIS_CACHE_CLIENT, evictable, fail-soft) and the
 * read goes through the shared `cached()` helper (single-flight, short
 * lease, jittered TTL).
 */
const BLOCK_SET_TTL_SECONDS = 60;
const blockSetKey = (userId: string) => `blocks:${userId}`;

export function cachedBlockSet(
  prisma: Pick<PrismaClient, 'userBlock'>,
  redis: Redis,
  userId: string,
): Promise<string[]> {
  return cached<string[]>(
    redis,
    blockSetKey(userId),
    { ttlSec: BLOCK_SET_TTL_SECONDS },
    async () => {
      const rows = await prisma.userBlock.findMany({
        where: { OR: [{ blocker_id: userId }, { blocked_id: userId }] },
        select: { blocker_id: true, blocked_id: true },
        take: 5000,
      });
      return [
        ...new Set(
          rows.map((r) =>
            r.blocker_id === userId ? r.blocked_id : r.blocker_id,
          ),
        ),
      ];
    },
  );
}

/** Called when a block is created or removed: both users' sets change. */
export async function dropBlockSets(
  redis: Redis,
  ...userIds: string[]
): Promise<void> {
  await redis.del(...userIds.map(blockSetKey));
}
