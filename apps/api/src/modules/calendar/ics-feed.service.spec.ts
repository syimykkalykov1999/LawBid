import {
  FEED_RATE_PER_MINUTE,
  IcsFeedService,
  hashToken,
} from './ics-feed.service';

const TOKEN = `lbc_${'a'.repeat(43)}`;

/** R-38: the public feed is cached, conditional and rate limited per link. */
function make() {
  const store = new Map<string, string>();
  const redis = {
    get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    set: jest.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve('OK');
    }),
    del: jest.fn((k: string) => Promise.resolve(store.delete(k) ? 1 : 0)),
    incr: jest.fn((k: string) => {
      const n = Number(store.get(k) ?? 0) + 1;
      store.set(k, String(n));
      return Promise.resolve(n);
    }),
    expire: jest.fn(() => Promise.resolve(1)),
  };
  const prisma = {
    calendarFeedToken: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          id: 't1',
          user_id: 'u1',
          token_hash: hashToken(TOKEN),
          last_used_at: new Date(),
        }),
      ),
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
    user: { findFirst: jest.fn(() => Promise.resolve({ id: 'u1' })) },
  };
  const cfg = { feedEnabled: jest.fn(() => Promise.resolve(true)) };
  const svc = new IcsFeedService(
    prisma as never,
    cfg as never,
    {} as never,
    redis as never,
  );
  const build = jest.spyOn(svc, 'build').mockResolvedValue({
    body: 'BEGIN:VCALENDAR',
    etag: '"e1"',
    lastModified: new Date(0),
  });
  return { svc, prisma, build, store, redis };
}

describe('IcsFeedService.serve (R-38)', () => {
  it('builds once, then answers from the 60 s cache without the database', async () => {
    const h = make();
    const first = await h.svc.serve(`${TOKEN}.ics`);
    expect(first.status).toBe(200);
    const second = await h.svc.serve(`${TOKEN}.ics`);
    expect(second.status).toBe(200);
    expect(h.build).toHaveBeenCalledTimes(1);
    expect(h.prisma.calendarFeedToken.findUnique).toHaveBeenCalledTimes(1);
    expect(h.redis.set).toHaveBeenCalledWith(
      `calendar:feed:${hashToken(TOKEN)}`,
      expect.any(String),
      'EX',
      60,
    );
  });

  it('If-None-Match / If-Modified-Since give 304', async () => {
    const h = make();
    const a = await h.svc.serve(`${TOKEN}.ics`);
    if (a.status !== 200) throw new Error('expected 200');
    expect((await h.svc.serve(`${TOKEN}.ics`, '"e1"')).status).toBe(304);
    expect((await h.svc.serve(`${TOKEN}.ics`, 'W/"e1"')).status).toBe(304);
    expect((await h.svc.serve(`${TOKEN}.ics`, '"other"')).status).toBe(200);
    expect(
      (
        await h.svc.serve(
          `${TOKEN}.ics`,
          undefined,
          a.lastModified.toUTCString(),
        )
      ).status,
    ).toBe(304);
  });

  it('rate limits one link, and rejects bad or switched-off links cheaply', async () => {
    const h = make();
    for (let i = 0; i < FEED_RATE_PER_MINUTE; i++) {
      expect((await h.svc.serve(`${TOKEN}.ics`)).status).toBe(200);
    }
    expect((await h.svc.serve(`${TOKEN}.ics`)).status).toBe(429);
    expect((await h.svc.serve('nope.ics')).status).toBe(404);
  });

  it('revoke drops the cached feed at once', async () => {
    const h = make();
    await h.svc.serve(`${TOKEN}.ics`);
    (h.prisma.calendarFeedToken as Record<string, unknown>).deleteMany =
      jest.fn(() => Promise.resolve({ count: 1 }));
    await h.svc.revoke('u1');
    expect(h.store.has(`calendar:feed:${hashToken(TOKEN)}`)).toBe(false);
  });
});
