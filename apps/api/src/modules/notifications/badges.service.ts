import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';

export interface Badges {
  chatsUnread: number;
  notificationsUnread: number;
  total: number;
}

const key = (userId: string) => `badge:${userId}`;
/** The hash expires daily, so every user's counters are re-read from the
 * DB at least once a day (§10 "раз в сутки сверяются с БД"). */
const TTL_SEC = 24 * 3600;

/**
 * docs/05 §10 badges: Redis counters per user (`chats`, `notifs`). Events
 * adjust them (a new message +1, a read → recount), a missing hash is
 * rebuilt from the DB. total = unread messages (muted chats included) +
 * unread notifications; `new_message` is never a notification row, so it
 * is not counted twice.
 */
@Injectable()
export class BadgesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly realtime: RealtimePublisher,
  ) {}

  async get(userId: string): Promise<Badges> {
    const h = await this.redis.hgetall(key(userId));
    if (h.chats === undefined && h.notifs === undefined) {
      return this.rebuild(userId);
    }
    const chats =
      h.chats === undefined ? await this.countChats(userId) : Number(h.chats);
    const notifs =
      h.notifs === undefined
        ? await this.countNotifications(userId)
        : Number(h.notifs);
    if (h.chats === undefined || h.notifs === undefined) {
      await this.redis.hset(key(userId), { chats, notifs });
    }
    return shape(chats, notifs);
  }

  /** A notification row was written (maybe not committed yet): drop the
   * cached count so the next read recounts; the delivery job recounts
   * and publishes after commit. */
  async invalidateNotifications(userId: string): Promise<void> {
    try {
      await this.redis.hdel(key(userId), 'notifs');
    } catch {
      // Redis down: the daily TTL still bounds the staleness.
    }
  }

  /** A message for [userId] arrived (after commit). */
  async messageArrived(userId: string): Promise<void> {
    if (await this.redis.exists(key(userId))) {
      await this.redis.hincrby(key(userId), 'chats', 1);
    }
    await this.publish(userId);
  }

  /** Something changed the unread notifications (new, aggregated, read). */
  async notificationsChanged(userId: string): Promise<void> {
    const notifs = await this.countNotifications(userId);
    if (await this.redis.exists(key(userId))) {
      await this.redis.hset(key(userId), 'notifs', notifs);
    }
    await this.publish(userId);
  }

  /** The user read messages in a chat. */
  async chatsChanged(userId: string): Promise<void> {
    const chats = await this.countChats(userId);
    if (await this.redis.exists(key(userId))) {
      await this.redis.hset(key(userId), 'chats', chats);
    }
    await this.publish(userId);
  }

  private async publish(userId: string): Promise<void> {
    this.realtime.toUsers([userId], 'badge:update', await this.get(userId));
  }

  private async rebuild(userId: string): Promise<Badges> {
    const [chats, notifs] = await Promise.all([
      this.countChats(userId),
      this.countNotifications(userId),
    ]);
    await this.redis
      .multi()
      .hset(key(userId), { chats, notifs })
      .expire(key(userId), TTL_SEC)
      .exec();
    return shape(chats, notifs);
  }

  private countNotifications(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { user_id: userId, read_at: null },
    });
  }

  private async countChats(userId: string): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(m.id) AS n
      FROM conversation_participants cp
      LEFT JOIN messages lr ON lr.id = cp.last_read_message_id
      JOIN messages m ON m.conversation_id = cp.conversation_id
      WHERE cp.user_id = ${userId}::UUID
        AND m.deleted_at IS NULL
        AND (m.sender_id IS NULL OR m.sender_id <> ${userId}::UUID)
        AND (lr.id IS NULL OR (m.created_at, m.id) > (lr.created_at, lr.id))`;
    return Number(row?.n ?? 0);
  }
}

function shape(chats: number, notifs: number): Badges {
  const c = Math.max(0, chats);
  const n = Math.max(0, notifs);
  return { chatsUnread: c, notificationsUnread: n, total: c + n };
}
