import type Redis from 'ioredis';
import type { PrismaService } from '../../prisma/prisma.service';
import type { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { BadgesService } from './badges.service';

/** Load test round 2 (docs/perf/LOCAL_LOAD_TEST_2026-10-28.md): the
 * notification switches are read once per person and kept until a
 * settings change drops them; the answers stay the same as reading the
 * database every time. */
function setup(cache = true) {
  const kv = new Map<string, string>();
  const redis = {
    get: jest.fn((k: string) =>
      cache
        ? Promise.resolve(kv.get(k) ?? null)
        : Promise.reject(new Error('down')),
    ),
    set: jest.fn((k: string, v: string) => {
      if (cache) kv.set(k, v);
      return Promise.resolve('OK');
    }),
    del: jest.fn((k: string) => {
      kv.delete(k);
      return Promise.resolve(1);
    }),
    hgetall: jest.fn().mockResolvedValue({ chats: '0', notifs: '0' }),
    multi: jest.fn(() => {
      const m = {
        hset: () => m,
        expire: () => m,
        exec: () => Promise.resolve([]),
      };
      return m;
    }),
  };
  const db = {
    rows: [{ category: 'messages', push_enabled: false }] as {
      category: string;
      push_enabled: boolean;
    }[],
    user: { notif_topics: { reactions: false }, notif_icon_badge: false } as {
      notif_topics: Record<string, boolean>;
      notif_icon_badge: boolean;
    },
  };
  const prisma = {
    notificationSetting: { findMany: jest.fn(() => Promise.resolve(db.rows)) },
    user: { findUnique: jest.fn(() => Promise.resolve(db.user)) },
    $queryRaw: jest.fn().mockResolvedValue([{ n: 0n }]),
  };
  const realtime = { toUsers: jest.fn() };
  const svc = new BadgesService(
    prisma as unknown as PrismaService,
    redis as unknown as Redis,
    realtime as unknown as RealtimePublisher,
  );
  return { svc, prisma, redis, db };
}

describe('BadgesService notification switches cache', () => {
  it('reads the database once for many questions about one person', async () => {
    const { svc, prisma } = setup();
    expect([...(await svc.mutedCategories('u'))]).toContain('messages');
    expect(await svc.iconBadgeOn('u')).toBe(false);
    const sw = await svc.topicSwitches('u');
    expect(sw.raw).toEqual({ reactions: false });
    expect(await svc.mutedCategories('u')).toEqual(
      await svc.mutedCategories('u'),
    );
    expect(prisma.notificationSetting.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('a settings change drops the copy: the next answer is the new value', async () => {
    const { svc, db } = setup();
    expect(await svc.iconBadgeOn('u')).toBe(false);
    expect((await svc.mutedCategories('u')).has('messages')).toBe(true);
    db.user = { notif_topics: {}, notif_icon_badge: true };
    db.rows = [];
    await svc.settingsChanged('u');
    expect(await svc.iconBadgeOn('u')).toBe(true);
    expect((await svc.mutedCategories('u')).has('messages')).toBe(false);
  });

  it('same answers as the database when the cache is down', async () => {
    const live = setup(false);
    const cached = setup(true);
    for (const s of [live, cached]) await s.svc.iconBadgeOn('u');
    expect([...(await live.svc.mutedCategories('u'))].sort()).toEqual(
      [...(await cached.svc.mutedCategories('u'))].sort(),
    );
    expect((await live.svc.topicSwitches('u')).raw).toEqual(
      (await cached.svc.topicSwitches('u')).raw,
    );
    expect(await live.svc.iconBadgeOn('u')).toBe(
      await cached.svc.iconBadgeOn('u'),
    );
  });
});
