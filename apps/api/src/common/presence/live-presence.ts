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

/** S1-4: set while a person's "offline" announcement is held back (value:
 * the hold's token, verify 5b C3). */
export const presenceOfflineKey = (userId: string) => `presence:off:${userId}`;

/** Verify 5b (C3): delete the held "offline" mark only when it is still
 * the one this hold wrote (Redis "SET … / compare-and-delete" lock pattern,
 * redis.io/docs/latest/develop/use/patterns/distributed-locks). */
export const SETTLE_OWN_HOLD_LUA = `if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0`;

/**
 * S1-4 / verify 5b (C4): the grace is over. True (and `last_active_at`
 * written) when the hold is still [token]'s (any hold, without a token),
 * nobody else settled it and the person has no live connection on any
 * instance; the caller announces. Shared by PresenceService (the in-process
 * fallback timer) and PresenceSettleJob (the delayed BullMQ job that also
 * settles a hold whose process died).
 */
export async function settleHeldOffline(
  redis: Pick<Redis, 'del' | 'eval' | 'zcount'>,
  users: {
    updateMany(args: {
      where: { id: string };
      data: { last_active_at: Date };
    }): Promise<unknown>;
  },
  userId: string,
  leftAt: Date,
  token?: string,
): Promise<boolean> {
  const removed =
    token === undefined
      ? await redis.del(presenceOfflineKey(userId))
      : Number(
          await redis.eval(
            SETTLE_OWN_HOLD_LUA,
            1,
            presenceOfflineKey(userId),
            token,
          ),
        );
  if (removed === 0) return false;
  if ((await livePresenceCount(redis, userId)) > 0) return false;
  await users.updateMany({
    where: { id: userId },
    data: { last_active_at: leftAt },
  });
  return true;
}

/**
 * Verify 5b (C4): a held "offline" was settled by the delayed job (any
 * process, the worker included). Every API instance gets the message and
 * tells ITS OWN sockets watching the person, each checked against the
 * person's current "last seen" audience (RealtimeGateway) — the pattern of
 * SESSION_REVOKED_CHANNEL. Fire-and-forget: a missed message only leaves a
 * watcher on "online" until its next `presence:watch`.
 */
export const PRESENCE_SETTLED_CHANNEL = 'presence:settled';

export interface PresenceSettledMessage {
  userId: string;
  /** ISO time the last connection dropped. */
  leftAt: string;
}

export function parsePresenceSettled(
  raw: string,
): PresenceSettledMessage | null {
  try {
    const v = JSON.parse(raw) as Partial<PresenceSettledMessage> | null;
    if (
      !v ||
      typeof v.userId !== 'string' ||
      v.userId.length === 0 ||
      typeof v.leftAt !== 'string' ||
      Number.isNaN(Date.parse(v.leftAt))
    ) {
      return null;
    }
    return { userId: v.userId, leftAt: v.leftAt };
  } catch {
    return null;
  }
}
