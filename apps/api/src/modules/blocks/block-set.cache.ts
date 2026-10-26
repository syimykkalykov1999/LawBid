import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import { delSafe } from '../../redis/redis-cluster-safe';

/**
 * Owner 2026-10-18 (speed): every feed page, reels page and People search
 * asked the database for the viewer's block set up to three times. The set
 * (both directions, as a JSON array of user ids) now lives in Redis for a
 * minute under `blocks:{uid}`. BlocksService.block / unblock delete the key
 * for BOTH users, so a new block or unblock applies at once; the TTL only
 * covers a Redis hiccup. Any Redis failure falls back to the query.
 */
const BLOCK_SET_TTL_SECONDS = 60;
const blockSetKey = (userId: string) => `blocks:${userId}`;

export async function cachedBlockSet(
  prisma: Pick<PrismaClient, 'userBlock'>,
  redis: Redis,
  userId: string,
): Promise<string[]> {
  try {
    const hit = await redis.get(blockSetKey(userId));
    if (hit !== null) return JSON.parse(hit) as string[];
  } catch {
    // fall through to the query
  }
  const rows = await prisma.userBlock.findMany({
    where: { OR: [{ blocker_id: userId }, { blocked_id: userId }] },
    select: { blocker_id: true, blocked_id: true },
    take: 5000,
  });
  const ids = [
    ...new Set(
      rows.map((r) => (r.blocker_id === userId ? r.blocked_id : r.blocker_id)),
    ),
  ];
  try {
    await redis.set(
      blockSetKey(userId),
      JSON.stringify(ids),
      'EX',
      BLOCK_SET_TTL_SECONDS,
    );
  } catch {
    // cache is best effort
  }
  return ids;
}

/** Called when a block is created or removed: both users' sets change. */
export async function dropBlockSets(
  redis: Redis,
  ...userIds: string[]
): Promise<void> {
  await delSafe(redis, userIds.map(blockSetKey));
}
