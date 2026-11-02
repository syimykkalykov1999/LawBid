import { FeedService, recoCurrentKey, recoKey } from './feed.service';

/** Algo audit 2026-10-27 (CONTENT H-3, M-3, M-4) — FeedService over fakes. */
function fakeRedis(seed: {
  snapshot?: string[];
  seen?: Set<string>;
  kv?: Record<string, string>;
}) {
  const kv = new Map<string, string>(Object.entries(seed.kv ?? {}));
  const snap = seed.snapshot ?? [];
  if (snap.length) kv.set(recoCurrentKey(), 'v1');
  const multi = {
    zadd: jest.fn(),
    zremrangebyrank: jest.fn(),
    expire: jest.fn(),
    exec: jest.fn().mockResolvedValue([]),
  };
  return {
    kv,
    get: jest.fn((k: string) => Promise.resolve(kv.get(k) ?? null)),
    set: jest.fn((k: string, v: string) => {
      kv.set(k, v);
      return Promise.resolve('OK');
    }),
    del: jest.fn(() => Promise.resolve(1)),
    exists: jest.fn((k: string) =>
      Promise.resolve(k === recoKey('v1') && snap.length ? 1 : 0),
    ),
    zrevrange: jest.fn((k: string, from: number, to: number) =>
      Promise.resolve(
        k === recoKey('v1')
          ? snap.slice(from, to === -1 ? undefined : to + 1)
          : [],
      ),
    ),
    zmscore: jest.fn((_k: string, ...ids: string[]) =>
      Promise.resolve(ids.map((id) => (seed.seen?.has(id) ? '1' : null))),
    ),
    multi: jest.fn(() => multi),
  };
}

const postOf = (id: string, author = `author-${id}`) => ({
  id,
  author_id: author,
  created_at: new Date('2026-10-27T00:00:00Z'),
});

function build(opts: {
  redis: ReturnType<typeof fakeRedis>;
  stored?: Record<string, number>;
}) {
  const findMany = jest.fn(
    (args: { where: { id?: { in: string[] }; AND?: unknown } }) =>
      Promise.resolve(
        args.where.id?.in ? args.where.id.in.map((id) => postOf(id)) : [],
      ),
  );
  const prisma = {
    post: { findMany },
    follow: { findMany: jest.fn().mockResolvedValue([]) },
    userBlock: { findMany: jest.fn().mockResolvedValue([]) },
    postRepost: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const presenter = {
    present: jest.fn((rows: { id: string }[]) =>
      Promise.resolve(rows.map((r) => ({ id: r.id }))),
    ),
    reposterNames: jest.fn().mockResolvedValue(new Map()),
  };
  const contentFilter = { modeOf: jest.fn().mockResolvedValue('all') };
  const settings = {
    number: jest.fn((k: string) =>
      Promise.resolve(
        opts.stored?.[k] ??
          (k === 'feed.reco_scan_max'
            ? 1000
            : k === 'feed.reposts_per_page'
              ? 30
              : 0),
      ),
    ),
  };
  const svc = new FeedService(
    prisma as never,
    presenter as never,
    opts.redis as never,
    contentFilter as never,
    undefined,
    undefined,
    undefined,
    settings as never,
  );
  return { svc, prisma, presenter };
}

const viewer = { sub: 'viewer', role: 'client' } as never;
const ids = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => `p${from + i}`);

describe('FeedService recommendations depth (CONTENT H-3)', () => {
  it('walks past the first 200 snapshot ids when they were all seen', async () => {
    const snapshot = ids(1000);
    const redis = fakeRedis({ snapshot, seen: new Set(ids(500)) });
    const { svc } = build({ redis });
    const page = await svc.page(viewer, undefined, 10);
    expect(page.items.map((p) => p.id)).toEqual(ids(10, 500));
    // Chunks of 200: the seen ones are not read from the database.
    expect(redis.zrevrange).toHaveBeenCalledTimes(3);
  });

  it('feed.reco_scan_max = 200 keeps the old single-chunk scan', async () => {
    const redis = fakeRedis({ snapshot: ids(1000), seen: new Set(ids(500)) });
    const { svc } = build({ redis, stored: { 'feed.reco_scan_max': 200 } });
    const page = await svc.page(viewer, undefined, 10);
    // Nothing unseen in the first 200: the rotation starts over (seen
    // cleared), still only the first chunk is looked at.
    expect(redis.zrevrange.mock.calls.every((c) => c[1] === 0)).toBe(true);
    expect(page.items.length).toBeLessThanOrEqual(10);
  });

  it('the next cursor continues after the last used snapshot rank', async () => {
    const redis = fakeRedis({ snapshot: ids(1000), seen: new Set(ids(450)) });
    const { svc } = build({ redis });
    const first = await svc.page(viewer, undefined, 10);
    expect(first.items[0].id).toBe('p450');
    const cursor = JSON.parse(
      Buffer.from(first.nextCursor!, 'base64url').toString('utf8'),
    ) as { r: number };
    expect(cursor.r).toBe(460);
  });
});

describe('FeedService recommendation reads (load test round 2)', () => {
  it('filters the chunk by id + author only and reads full rows for the picked posts', async () => {
    const redis = fakeRedis({ snapshot: ids(1000), seen: new Set(ids(5)) });
    const { svc, prisma } = build({ redis });
    const page = await svc.page(viewer, undefined, 10);
    expect(page.items.map((p) => p.id)).toEqual(ids(10, 5));
    const calls = prisma.post.findMany.mock.calls.map(
      (c) => c[0] as { where: { id?: { in: string[] } }; select?: unknown },
    );
    const chunk = calls.find((c) => c.select);
    expect(chunk?.select).toEqual({ id: true, author_id: true });
    expect(chunk?.where.id?.in).toHaveLength(195);
    const full = calls.filter((c) => !c.select && c.where.id?.in);
    expect(full[0].where.id?.in).toEqual(ids(10, 5));
  });

  it('a post gone between the two reads drops out with its snapshot rank', async () => {
    const redis = fakeRedis({ snapshot: ids(1000) });
    const { svc, prisma } = build({ redis });
    prisma.post.findMany.mockImplementation(
      (args: { where: { id?: { in: string[] } }; select?: unknown }) =>
        Promise.resolve(
          (args.where.id?.in ?? [])
            .filter((id) => args.select || id !== 'p1')
            .map((id) => postOf(id)),
        ),
    );
    const first = await svc.page(viewer, undefined, 3);
    expect(first.items.map((p) => p.id)).toEqual(['p0', 'p2']);
  });
});

describe('FeedService cached first page (CONTENT M-3)', () => {
  it('re-checks the block set: a blocked author drops out of a cached page', async () => {
    const redis = fakeRedis({
      kv: {
        'feed:first:viewer:10:all:0': JSON.stringify({
          ids: ['a', 'b'],
          next: null,
        }),
        'blocks:viewer': JSON.stringify(['author-b']),
      },
    });
    const { svc, prisma } = build({ redis });
    await svc.page(viewer, undefined, 10);
    const where = prisma.post.findMany.mock.calls[0][0].where as {
      author_id?: { notIn: string[] };
    };
    expect(where.author_id).toEqual({ notIn: ['author-b'] });
  });
});

describe('FeedService reposts per page (CONTENT M-4)', () => {
  const run = async (stored?: Record<string, number>) => {
    const { svc, prisma } = build({ redis: fakeRedis({}), stored });
    await (
      svc as unknown as {
        repostsInWindow: (...a: unknown[]) => Promise<unknown>;
      }
    ).repostsInWindow(viewer, ['x'], null, null, {}, new Set());
    return prisma.postRepost.findMany.mock.calls[0][0] as { take: number };
  };
  it('default 30 (was a fixed 10)', async () => {
    expect((await run()).take).toBe(30);
  });
  it('follows the admin value, clamped', async () => {
    expect((await run({ 'feed.reposts_per_page': 10 })).take).toBe(10);
    expect((await run({ 'feed.reposts_per_page': 5000 })).take).toBe(100);
  });
});
