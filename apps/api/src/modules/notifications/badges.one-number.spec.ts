import type Redis from 'ioredis';
import type { PrismaService } from '../../prisma/prisma.service';
import type { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { BadgesService } from './badges.service';

/**
 * R-379 (owner 2026-11-04, Samsung): the app icon said «2» while the app
 * showed nothing unread. One number everywhere, like WhatsApp / Telegram:
 * the push badge, GET /badges and `badge:update` all come from
 * BadgesService, and a read brings all of them to the same value.
 */
function setup() {
  const hash = new Map<string, Record<string, string>>();
  const redis = {
    hgetall: jest.fn((k: string) =>
      Promise.resolve({ ...(hash.get(k) ?? {}) }),
    ),
    hset: jest.fn((k: string, a: unknown, b?: unknown) => {
      const h = hash.get(k) ?? {};
      if (typeof a === 'string') h[a] = String(b);
      else
        for (const [f, v] of Object.entries(a as Record<string, unknown>)) {
          h[f] = String(v);
        }
      hash.set(k, h);
      return Promise.resolve(1);
    }),
    exists: jest.fn((k: string) => Promise.resolve(hash.has(k) ? 1 : 0)),
    eval: jest.fn((_s: string, _n: number, k: string) => {
      const h = hash.get(k);
      if (!h || h.chats === undefined) return Promise.resolve(0);
      h.chats = String(Number(h.chats) + 1);
      return Promise.resolve(Number(h.chats));
    }),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    multi: jest.fn(() => {
      const ops: (() => void)[] = [];
      const m = {
        hset: (k: string, v: Record<string, unknown>) => {
          ops.push(() => void redis.hset(k, v));
          return m;
        },
        expire: () => m,
        exec: () => {
          ops.forEach((o) => o());
          return Promise.resolve([]);
        },
      };
      return m;
    }),
  };
  // What the database holds: unread messages (1:1, groups), notifications.
  const db = { direct: 2, groups: 0, notifs: 0 };
  const prisma = {
    notificationSetting: { findMany: jest.fn().mockResolvedValue([]) },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ notif_topics: null, notif_icon_badge: true }),
    },
    $queryRaw: jest.fn((strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      const n = sql.includes('FROM notifications')
        ? db.notifs
        : sql.includes('chat_group_members')
          ? db.groups
          : db.direct;
      return Promise.resolve([{ n: BigInt(n) }]);
    }),
  };
  const published: unknown[] = [];
  const realtime = {
    toUsers: jest.fn((_ids: string[], _ev: string, data: unknown) => {
      published.push(data);
    }),
  };
  const svc = new BadgesService(
    prisma as unknown as PrismaService,
    redis as unknown as Redis,
    realtime as unknown as RealtimePublisher,
  );
  return { svc, db, published };
}

describe('R-379: one unread number for the icon and the app', () => {
  it('a push, GET /badges and badge:update carry the same total', async () => {
    const { svc, published } = setup();
    expect((await svc.get('u')).total).toBe(2);
    expect(await svc.forIcon('u')).toBe(2);
    await svc.messageArrived('u');
    expect((await svc.get('u')).total).toBe(3);
    expect(await svc.forIcon('u')).toBe(3);
    expect(published.at(-1)).toMatchObject({ total: 3, iconBadge: true });
  });

  it('reading the chat brings the icon, the app and the push to 0', async () => {
    const { svc, db, published } = setup();
    expect(await svc.forIcon('u')).toBe(2);
    db.direct = 0; // the chat was read
    await svc.chatsChanged('u');
    expect(published.at(-1)).toMatchObject({
      chatsUnread: 0,
      notificationsUnread: 0,
      total: 0,
    });
    expect((await svc.get('u')).total).toBe(0);
    expect(await svc.forIcon('u')).toBe(0);
  });

  it('a read notification leaves only the unread chats on the icon', async () => {
    const { svc, db, published } = setup();
    db.notifs = 1;
    db.direct = 0;
    expect(await svc.forIcon('u')).toBe(1);
    db.notifs = 0;
    await svc.notificationsChanged('u');
    expect(published.at(-1)).toMatchObject({ total: 0 });
    expect(await svc.forIcon('u')).toBe(0);
  });
});
