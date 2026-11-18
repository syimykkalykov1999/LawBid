import type Redis from 'ioredis';

/** The Redis sorted set of one person's live app connections (members:
 * socket ids, scores: expiry in ms). Owned by PresenceService; shared here
 * so other modules can ask "is this person connected anywhere" without
 * depending on the presence module. */
export const presenceKey = (userId: string) => `presence:${userId}`;

/** Verify 5b (17.11): live app connections of [userId] on ANY API instance. */
export async function livePresenceCount(
  redis: Pick<Redis, 'zcount'>,
  userId: string,
): Promise<number> {
  return redis.zcount(presenceKey(userId), Date.now(), '+inf');
}
