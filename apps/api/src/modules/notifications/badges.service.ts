import { Inject, Injectable } from '@nestjs/common';
import type { NotificationCategory } from '@prisma/client';
import { DEFAULT_PUSH, LOCKED_CATEGORIES } from './notification-rules';
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
/** Unread messages per chat stop at this (the app shows "99+"): cost
 * stays bounded however long a chat's history is (load review). */
export const UNREAD_CAP = 100;
/** "999+" on the notifications badge: counting stops here. */
const NOTIFS_CAP = 1000;
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

  /** OQ-048: an assistant sees the attorney's chats but their own
   * notifications. */
  async forAssistant(attorneyId: string, assistantId: string): Promise<Badges> {
    const [chats, mine] = await Promise.all([
      this.get(attorneyId),
      this.get(assistantId),
    ]);
    return shape(chats.chatsUnread, mine.notificationsUnread);
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

  /**
   * Owner 2026-10-02: a category the user switched off in Settings →
   * Notifications still delivers (the chat, the bell list, the call) but
   * never counts on a badge, pushes or rings. Unset categories follow the
   * §9.5 defaults; `system` can't be switched off.
   */
  async mutedCategories(userId: string): Promise<Set<NotificationCategory>> {
    const rows = await this.prisma.notificationSetting.findMany({
      where: { user_id: userId },
      select: { category: true, push_enabled: true },
    });
    const set = new Map(rows.map((r) => [r.category, r.push_enabled]));
    const muted = new Set<NotificationCategory>();
    for (const c of Object.keys(DEFAULT_PUSH) as NotificationCategory[]) {
      if (LOCKED_CATEGORIES.has(c)) continue;
      if (!(set.get(c) ?? DEFAULT_PUSH[c])) muted.add(c);
    }
    return muted;
  }

  /** Settings → Notifications changed: recount both badges. */
  async settingsChanged(userId: string): Promise<void> {
    await this.rebuild(userId);
    await this.publish(userId);
  }

  /** A message for [userId] arrived (after commit). */
  async messageArrived(userId: string): Promise<void> {
    if ((await this.mutedCategories(userId)).has('messages')) {
      await this.publish(userId);
      return;
    }
    // Only bumps an existing counter (a missing hash is rebuilt on read):
    // one atomic round trip.
    await this.redis.eval(
      "if redis.call('HEXISTS', KEYS[1], 'chats') == 1 then return redis.call('HINCRBY', KEYS[1], 'chats', 1) end return 0",
      1,
      key(userId),
    );
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

  /** Partial index notifications_user_unread_idx; stops at the cap. */
  private async countNotifications(userId: string): Promise<number> {
    const muted = [...(await this.mutedCategories(userId))].map(String);
    const [row] = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM (
        SELECT 1 FROM notifications
        WHERE user_id = ${userId}::UUID AND read_at IS NULL
          AND NOT (category::STRING = ANY(${muted}::STRING[]))
        LIMIT ${NOTIFS_CAP}) x`;
    return Number(row?.n ?? 0);
  }

  private async countChats(userId: string): Promise<number> {
    if ((await this.mutedCategories(userId)).has('messages')) return 0;
    // Per chat at most UNREAD_CAP rows are read (the index on
    // messages(conversation_id, created_at DESC) stops each scan early).
    const [row] = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT coalesce(sum((
        SELECT count(*) FROM (
          SELECT 1 FROM messages m
          WHERE m.conversation_id = cp.conversation_id
            AND m.deleted_at IS NULL
            AND (m.sender_id IS NULL OR m.sender_id <> ${userId}::UUID)
            AND (lr.id IS NULL OR (m.created_at, m.id) > (lr.created_at, lr.id))
          ORDER BY m.created_at DESC
          LIMIT ${UNREAD_CAP}) x)), 0)::INT8 AS n
      FROM conversation_participants cp
      JOIN conversations c ON c.id = cp.conversation_id
      LEFT JOIN messages lr ON lr.id = cp.last_read_message_id
      WHERE cp.user_id = ${userId}::UUID
        -- Message requests sent to me (pending or declined) never count:
        -- the same rule as the "All" folder (OQ-043).
        AND (c.request_status::STRING IN ('none', 'accepted')
             OR c.requested_by = ${userId}::UUID)`;
    return Number(row?.n ?? 0);
  }
}

function shape(chats: number, notifs: number): Badges {
  const c = Math.max(0, chats);
  const n = Math.max(0, notifs);
  return { chatsUnread: c, notificationsUnread: n, total: c + n };
}
