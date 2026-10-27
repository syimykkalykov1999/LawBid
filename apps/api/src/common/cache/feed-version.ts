import type Redis from 'ioredis';

/**
 * Owner 2026-10-25 (caching round 2, S2-3): the viewer's feed first page is
 * cached for 60 s, but used to survive the viewer's own post, a follow or a
 * block, so pull-to-refresh showed the old page. Now the cache key carries
 * a per-viewer VERSION (`feed:ver:{uid}`, a millisecond stamp). Anything
 * that changes what the viewer's own feed shows bumps it, and the next read
 * misses at once. The stamp is a pure cache value (cache Redis client): if
 * it is lost the version reads `0` and an entry older than the 60 s TTL is
 * long gone, so a lost stamp can only cost a miss.
 */
export const feedVersionKey = (uid: string) => `feed:ver:${uid}`;
const VERSION_TTL_SEC = 24 * 3600;

export async function feedVersion(redis: Redis, uid: string): Promise<string> {
  try {
    return (await redis.get(feedVersionKey(uid))) ?? '0';
  } catch {
    return '0';
  }
}

/** The viewers' own feeds changed: own post / delete, follow, unfollow,
 * block, unblock. Never throws (a failed bump is a stale page for 60 s,
 * today's behaviour). */
export async function bumpFeedVersion(
  redis: Redis,
  ...uids: string[]
): Promise<void> {
  const stamp = String(Date.now());
  await Promise.all(
    uids.map((uid) =>
      Promise.resolve()
        .then(() =>
          redis.set(feedVersionKey(uid), stamp, 'EX', VERSION_TTL_SEC),
        )
        .catch(() => undefined),
    ),
  );
}
