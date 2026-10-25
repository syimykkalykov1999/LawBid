import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { PrivacySettingsService } from '../privacy-settings/privacy-settings.service';

/** A socket counts as online this long after its last heartbeat. */
export const PRESENCE_TTL_MS = 120_000;

const key = (userId: string) => `presence:${userId}`;
/** S1-4: set while a person's "offline" announcement is held back. */
const offlineKey = (userId: string) => `presence:off:${userId}`;
/** S1-4: cached "may [viewer] see [target]'s status" answer. */
const permKey = (viewerId: string, targetId: string) =>
  `presence:perm:${viewerId}:${targetId}`;

export interface PresenceView {
  online: boolean;
  lastSeenAt: Date | null;
}

/**
 * Owner 2026-10-01: "online / last seen" in chats. Each app connection
 * (socket) of a user is a member of a Redis sorted set scored by its
 * expiry; the gateway refreshes it on a heartbeat, so a crashed instance
 * ages out on its own. When the last connection closes, users.last_active_at
 * becomes the "last seen" time. Like Instagram's activity status it is
 * reciprocal: who hides theirs sees nobody's.
 */
@Injectable()
export class PresenceService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly privacy: PrivacySettingsService,
  ) {}

  /** Connect / heartbeat. True when the user just came online. */
  async touch(userId: string, socketId: string): Promise<boolean> {
    return (await this.touchCount(userId, socketId)) === 0;
  }

  /** [touch], returning how many live sockets the user had before this one
   * (cluster-wide: the set is in Redis). */
  async touchCount(userId: string, socketId: string): Promise<number> {
    const now = Date.now();
    const k = key(userId);
    const res = await this.redis
      .multi()
      .zremrangebyscore(k, 0, now)
      .zcard(k)
      .zadd(k, now + PRESENCE_TTL_MS, socketId)
      .pexpire(k, PRESENCE_TTL_MS)
      .exec();
    return Number(res?.[1]?.[1] ?? 0);
  }

  /** Disconnect. True when it was the user's last connection.
   * [writeLastSeen] false: the caller holds the offline announcement back
   * (S1-4, [holdOffline] / [settleOffline]) and writes the time itself. */
  async leave(
    userId: string,
    socketId: string,
    writeLastSeen = true,
  ): Promise<boolean> {
    const now = Date.now();
    const k = key(userId);
    const res = await this.redis
      .multi()
      .zrem(k, socketId)
      .zremrangebyscore(k, 0, now)
      .zcard(k)
      .exec();
    const left = Number(res?.[2]?.[1] ?? 0) === 0;
    if (left && writeLastSeen) {
      await this.prisma.user.updateMany({
        where: { id: userId },
        data: { last_active_at: new Date() },
      });
    }
    return left;
  }

  /** S1-4: the last connection dropped; the "offline" announcement waits
   * [graceSec] seconds for a reconnect (a flapping phone never shows). */
  async holdOffline(userId: string, graceSec: number): Promise<void> {
    await this.redis.set(offlineKey(userId), '1', 'EX', graceSec + 30);
  }

  /** S1-4: a connection came back. True when an "offline" announcement was
   * being held, i.e. the watchers never saw the person leave. Atomic, so
   * only one instance wins against the grace timer. */
  async cancelOffline(userId: string): Promise<boolean> {
    return (await this.redis.del(offlineKey(userId))) > 0;
  }

  /** S1-4: the grace is over. True (and `last_active_at` written) when the
   * person is still away and nobody else settled it; the caller announces. */
  async settleOffline(userId: string, leftAt: Date): Promise<boolean> {
    if ((await this.redis.del(offlineKey(userId))) === 0) return false;
    const live = await this.redis.zcount(key(userId), Date.now(), '+inf');
    if (live > 0) return false;
    await this.prisma.user.updateMany({
      where: { id: userId },
      data: { last_active_at: leftAt },
    });
    return true;
  }

  /** S1-4: [snapshot] for one watcher, remembered [ttlSec] seconds in Redis
   * (the announce path used to run two DB queries per watcher per flap).
   * [ttlSec] 0 = no cache. */
  async mayWatch(
    viewerId: string,
    targetId: string,
    ttlSec: number,
  ): Promise<boolean> {
    if (ttlSec <= 0) {
      return (await this.snapshot(viewerId, [targetId])).has(targetId);
    }
    const k = permKey(viewerId, targetId);
    try {
      const hit = await this.redis.get(k);
      if (hit !== null) return hit === '1';
    } catch {
      // cache down: ask the database
    }
    const ok = (await this.snapshot(viewerId, [targetId])).has(targetId);
    try {
      await this.redis.set(k, ok ? '1' : '0', 'EX', ttlSec);
    } catch {
      // not cached
    }
    return ok;
  }

  async visible(userId: string): Promise<boolean> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { show_activity_status: true },
    });
    return u?.show_activity_status ?? false;
  }

  async setVisible(userId: string, show: boolean): Promise<boolean> {
    // Also writes the "last seen" audience (everyone / nobody).
    await this.privacy.setActivityVisible(userId, show);
    return show;
  }

  /**
   * What [viewerId] may see about [ids]: nothing when the viewer hides
   * their own status, or the other person hides theirs from the viewer
   * (nobody, or contacts only and the viewer is not one).
   */
  async snapshot(
    viewerId: string,
    ids: string[],
  ): Promise<Map<string, PresenceView>> {
    const out = new Map<string, PresenceView>();
    const unique = [...new Set(ids)].filter((id) => id !== viewerId);
    if (unique.length === 0) return out;
    const users = await this.prisma.user.findMany({
      where: { id: { in: [viewerId, ...unique] } },
      select: { id: true, last_active_at: true, show_activity_status: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    if (!byId.get(viewerId)?.show_activity_status) return out;
    const shownByFlag = unique.filter(
      (id) => byId.get(id)?.show_activity_status,
    );
    const allowed = await this.privacy.lastSeenVisibleTo(viewerId, shownByFlag);
    const shown = shownByFlag.filter((id) => allowed.has(id));
    if (shown.length === 0) return out;
    const now = Date.now();
    const pipe = this.redis.pipeline();
    for (const id of shown) pipe.zcount(key(id), now, '+inf');
    const counts = (await pipe.exec()) ?? [];
    shown.forEach((id, i) => {
      out.set(id, {
        online: Number(counts[i]?.[1] ?? 0) > 0,
        lastSeenAt: byId.get(id)?.last_active_at ?? null,
      });
    });
    return out;
  }
}
