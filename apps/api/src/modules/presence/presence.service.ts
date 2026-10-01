import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';

/** A socket counts as online this long after its last heartbeat. */
export const PRESENCE_TTL_MS = 120_000;

const key = (userId: string) => `presence:${userId}`;

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
  ) {}

  /** Connect / heartbeat. True when the user just came online. */
  async touch(userId: string, socketId: string): Promise<boolean> {
    const now = Date.now();
    const k = key(userId);
    const res = await this.redis
      .multi()
      .zremrangebyscore(k, 0, now)
      .zcard(k)
      .zadd(k, now + PRESENCE_TTL_MS, socketId)
      .pexpire(k, PRESENCE_TTL_MS)
      .exec();
    const before = Number(res?.[1]?.[1] ?? 0);
    return before === 0;
  }

  /** Disconnect. True when it was the user's last connection. */
  async leave(userId: string, socketId: string): Promise<boolean> {
    const now = Date.now();
    const k = key(userId);
    const res = await this.redis
      .multi()
      .zrem(k, socketId)
      .zremrangebyscore(k, 0, now)
      .zcard(k)
      .exec();
    const left = Number(res?.[2]?.[1] ?? 0) === 0;
    if (left) {
      await this.prisma.user.updateMany({
        where: { id: userId },
        data: { last_active_at: new Date() },
      });
    }
    return left;
  }

  async visible(userId: string): Promise<boolean> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { show_activity_status: true },
    });
    return u?.show_activity_status ?? false;
  }

  async setVisible(userId: string, show: boolean): Promise<boolean> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { show_activity_status: show },
    });
    return show;
  }

  /**
   * What [viewerId] may see about [ids]: nothing when the viewer hides
   * their own status or the other person hides theirs.
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
    const shown = unique.filter((id) => byId.get(id)?.show_activity_status);
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
