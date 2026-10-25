import { unreadMessagesSql } from '../groups/group-unread.sql';
import { Inject, Injectable } from '@nestjs/common';
import type { NotificationCategory, NotificationType } from '@prisma/client';
import {
  ALWAYS_PUSH,
  DEFAULT_PUSH,
  LOCKED_CATEGORIES,
} from './notification-rules';
import { TYPE_TOPIC, readTopics, topicOn } from './notification-topics';
import type Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { pipeline } from '../../redis/redis-cluster-safe';

export interface Badges {
  chatsUnread: number;
  notificationsUnread: number;
  total: number;
  /** Owner 2026-10-21 (inbox 29): the «Счётчик на иконке в меню» switch;
   * false = the app keeps its icon clear. Sent with GET /badges and
   * `badge:update` only. */
  iconBadge?: boolean;
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

  /** Owner 2026-10-21 (inbox 29): the «Счётчик на иконке в меню» switch
   * (default on). */
  async iconBadgeOn(userId: string): Promise<boolean> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notif_icon_badge: true },
    });
    return u?.notif_icon_badge ?? true;
  }

  /** The number a push puts on the app icon: the total, or 0 while the
   * switch is off (0 also clears an older number, like Telegram). */
  async forIcon(userId: string): Promise<number> {
    return (await this.iconFor(userId)).badge;
  }

  /** [forIcon] plus the switch itself: off also sends the Android alert
   * through a channel without a launcher badge (PushMessage.iconBadge). */
  async iconFor(userId: string): Promise<{ badge: number; on: boolean }> {
    const [b, on] = await Promise.all([
      this.get(userId),
      this.iconBadgeOn(userId),
    ]);
    return { badge: on ? b.total : 0, on };
  }

  /** [b] plus the [ownerId]'s icon switch (GET /badges, `badge:update`). */
  async withIcon(ownerId: string, b: Badges): Promise<Badges> {
    return { ...b, iconBadge: await this.iconBadgeOn(ownerId) };
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

  /** Owner 2026-10-22: [invalidateNotifications] for many people, one
   * round trip. */
  async invalidateNotificationsMany(userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    try {
      const p = pipeline(this.redis);
      for (const id of userIds) p.hdel(key(id), 'notifs');
      await p.exec();
    } catch {
      // Redis down: the daily TTL still bounds the staleness.
    }
  }

  /**
   * Owner 2026-10-22 (server load audit, finding 7): [messageArrived] for
   * every member a group message reached, batched — one settings query,
   * one icon-switch query, a Redis pipeline for the counters and the reads,
   * then one `badge:update` each. A member counted for [messageId] once is
   * never counted again (a retried fan-out job).
   */
  async messagesArrived(userIds: string[], messageId: string): Promise<void> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return;
    const doneKey = `badge:msg:${messageId}`;
    const claim = pipeline(this.redis);
    for (const id of ids) claim.sadd(doneKey, id);
    claim.expire(doneKey, TTL_SEC);
    const claimed = (await claim.exec()) ?? [];
    const fresh = ids.filter((_, i) => Number(claimed[i]?.[1] ?? 0) === 1);
    if (fresh.length === 0) return;
    const [settings, users] = await Promise.all([
      this.prisma.notificationSetting.findMany({
        where: { user_id: { in: fresh }, category: 'messages' },
        select: { user_id: true, push_enabled: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: fresh } },
        select: { id: true, notif_icon_badge: true },
      }),
    ]);
    // The same rule as [mutedCategories] for `messages`.
    const setting = new Map(settings.map((s) => [s.user_id, s.push_enabled]));
    const muted = new Set(
      fresh.filter((id) => !(setting.get(id) ?? DEFAULT_PUSH.messages)),
    );
    const bump = pipeline(this.redis);
    for (const id of fresh) {
      if (muted.has(id)) continue;
      bump.eval(
        "if redis.call('HEXISTS', KEYS[1], 'chats') == 1 then return redis.call('HINCRBY', KEYS[1], 'chats', 1) end return 0",
        1,
        key(id),
      );
    }
    for (const id of fresh) bump.hgetall(key(id));
    const res = (await bump.exec()) ?? [];
    const reads = res.slice(res.length - fresh.length);
    const icon = new Map(users.map((u) => [u.id, u.notif_icon_badge]));
    await Promise.all(
      fresh.map(async (id, i) => {
        const h = (reads[i]?.[1] ?? {}) as Record<string, string>;
        // A missing or half hash is rebuilt the usual way (rare: expired).
        const b =
          h.chats !== undefined && h.notifs !== undefined
            ? shape(Number(h.chats), Number(h.notifs))
            : await this.get(id);
        this.realtime.toUsers([id], 'badge:update', {
          ...b,
          iconBadge: icon.get(id) ?? true,
        });
      }),
    );
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

  /**
   * Owner 2026-10-21 (inbox 30): the user's switches per kind of
   * notification. `on(topic)` — the effective value (a finer switch not set
   * yet follows its old category); `raw` — only what the user set.
   */
  async topicSwitches(userId: string): Promise<{
    on: (topic: string) => boolean;
    /** The switch itself, whatever its parent says. */
    own: (topic: string) => boolean;
    raw: Record<string, boolean>;
  }> {
    const [rows, u] = await Promise.all([
      this.prisma.notificationSetting.findMany({
        where: { user_id: userId },
        select: { category: true, push_enabled: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { notif_topics: true },
      }),
    ]);
    const set = new Map(rows.map((r) => [r.category, r.push_enabled]));
    const categoryOn = (c: NotificationCategory) =>
      LOCKED_CATEGORIES.has(c) || (set.get(c) ?? DEFAULT_PUSH[c]);
    const raw = readTopics(u?.notif_topics);
    return {
      on: (t) => topicOn(t, raw, categoryOn),
      own: (t) => topicOn(t, raw, categoryOn, true),
      raw,
    };
  }

  /** Types switched off (never counted on a badge, never pushed). */
  private async mutedTypes(userId: string): Promise<string[]> {
    const { on } = await this.topicSwitches(userId);
    return (Object.keys(TYPE_TOPIC) as NotificationType[]).filter(
      (t) => !ALWAYS_PUSH.has(t) && !on(TYPE_TOPIC[t]),
    );
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
    this.realtime.toUsers(
      [userId],
      'badge:update',
      await this.withIcon(userId, await this.get(userId)),
    );
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
    // Owner 2026-10-21 (inbox 30): per kind of notification.
    const muted = await this.mutedTypes(userId);
    const [row] = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM (
        SELECT 1 FROM notifications
        WHERE user_id = ${userId}::UUID AND read_at IS NULL
          AND NOT (type::TEXT = ANY(${muted}::TEXT[]))
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
        -- A chat I hid doesn't count (a new message unhides it).
        AND cp.hidden_at IS NULL
        -- Message requests sent to me (pending or declined) never count:
        -- the same rule as the "All" folder (OQ-043).
        AND (c.request_status::TEXT IN ('none', 'accepted')
             OR c.requested_by = ${userId}::UUID)`;
    // Owner 2026-10-20: group chats count the same way.
    const [groups] = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT coalesce(sum((
        SELECT count(*) FROM (
          SELECT 1 FROM ${unreadMessagesSql(userId)}
          ORDER BY m.created_at DESC
          LIMIT ${UNREAD_CAP}) x)), 0)::INT8 AS n
      FROM chat_group_members gm
      JOIN chat_groups g ON g.id = gm.group_id AND g.deleted_at IS NULL
      WHERE gm.user_id = ${userId}::UUID
        AND gm.left_at IS NULL
        AND gm.hidden_at IS NULL`;
    return Number(row?.n ?? 0) + Number(groups?.n ?? 0);
  }
}

function shape(chats: number, notifs: number): Badges {
  const c = Math.max(0, chats);
  const n = Math.max(0, notifs);
  return { chatsUnread: c, notificationsUnread: n, total: c + n };
}
