import {
  FeedService,
  recoAuthorsKey,
  recoCurrentKey,
  recoKey,
} from './feed.service';
import { VISIBLE_POST_WHERE } from '../posts/post-presenter.service';

/** Algo audit 2026-10-27 (CONTENT H-3, M-3, M-4) — FeedService over fakes. */
function fakeRedis(seed: {
  snapshot?: string[];
  seen?: Set<string>;
  kv?: Record<string, string>;
  authors?: Record<string, string>;
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
    hmget: jest.fn((k: string, ...fields: string[]) =>
      Promise.resolve(
        fields.map((f) =>
          k === recoAuthorsKey('v1') ? (seed.authors?.[f] ?? null) : null,
        ),
      ),
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
    user: {
      findMany: jest.fn((args: { where: { id: { in: string[] } } }) =>
        Promise.resolve(
          args.where.id.in
            .filter((id) => !id.startsWith('suspended'))
            .map((id) => ({ id })),
        ),
      ),
    },
    userBlock: { findMany: jest.fn().mockResolvedValue([]) },
    postRepost: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
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

describe('FeedService recommendation reads (row 64, 10M spike)', () => {
  /** Snapshot ids with authors, some posts hidden, some authors followed. */
  function world(opts: {
    n: number;
    hash: boolean;
    hidden?: Set<string>;
    followed?: string[];
    seen?: Set<string>;
  }) {
    const snapshot = ids(opts.n);
    const authorOf = (id: string) => `a${Number(id.slice(1)) % 7}`;
    const redis = fakeRedis({
      snapshot,
      seen: opts.seen,
      authors: opts.hash
        ? Object.fromEntries(snapshot.map((id) => [id, authorOf(id)]))
        : undefined,
    });
    const { svc, prisma } = build({ redis });
    prisma.follow.findMany.mockResolvedValue(
      (opts.followed ?? []).map((followee_id) => ({ followee_id })),
    );
    prisma.post.findMany.mockImplementation(
      (args: {
        where: { id?: { in: string[] }; status?: string; author_id?: unknown };
        select?: unknown;
      }) => {
        if (!args.where.id?.in) return Promise.resolve([]);
        return Promise.resolve(
          args.where.id.in
            .filter((id) => !(args.where.status && opts.hidden?.has(id)))
            .map((id) => postOf(id, authorOf(id))),
        );
      },
    );
    /** The old rule: snapshot order, unseen, visible, author not followed. */
    const expected = (need: number) =>
      snapshot
        .filter(
          (id) =>
            !opts.seen?.has(id) &&
            !opts.hidden?.has(id) &&
            !(opts.followed ?? []).includes(authorOf(id)),
        )
        .slice(0, need);
    return { svc, prisma, redis, expected };
  }

  const calls = (prisma: ReturnType<typeof build>['prisma']) =>
    prisma.post.findMany.mock.calls.map(
      (c) =>
        c[0] as {
          where: { id?: { in: string[] }; status?: string };
          select?: unknown;
        },
    );

  it('with the author hash: no chunk-wide read, only the needed full rows', async () => {
    const w = world({ n: 1000, hash: true, seen: new Set(ids(5)) });
    const page = await w.svc.page(viewer, undefined, 10);
    expect(page.items.map((p) => p.id)).toEqual(w.expected(10));
    const reads = calls(w.prisma).filter((c) => c.where.id?.in);
    expect(reads.every((c) => !c.select)).toBe(true);
    expect(reads.every((c) => c.where.status === 'published')).toBe(true);
    expect(reads.map((c) => c.where.id!.in.length)).toEqual([10]);
  });

  it('followed authors are dropped by the hash, hidden posts by the read', async () => {
    const w = world({
      n: 1000,
      hash: true,
      followed: ['a1', 'a3'],
      hidden: new Set(['p0', 'p2', 'p4', 'p13']),
      seen: new Set(['p5', 'p6']),
    });
    const page = await w.svc.page(viewer, undefined, 10);
    expect(page.items.map((p) => p.id)).toEqual(w.expected(10));
    const reads = calls(w.prisma).filter((c) => c.where.id?.in);
    // No followed author is ever read.
    const read = reads.flatMap((c) => c.where.id!.in);
    expect(
      read.some((id) => ['a1', 'a3'].includes(`a${+id.slice(1) % 7}`)),
    ).toBe(false);
  });

  it('a snapshot without the hash (written before it) gives the same page', async () => {
    const opts = {
      n: 1000,
      followed: ['a2'],
      hidden: new Set(['p1', 'p9']),
      seen: new Set(['p3']),
    };
    const old = world({ ...opts, hash: false });
    const now = world({ ...opts, hash: true });
    const a = await old.svc.page(viewer, undefined, 10);
    const b = await now.svc.page(viewer, undefined, 10);
    expect(a.items.map((p) => p.id)).toEqual(old.expected(10));
    expect(b.items.map((p) => p.id)).toEqual(a.items.map((p) => p.id));
    expect(b.nextCursor).toEqual(a.nextCursor);
    // Old snapshot: authors of the chunk by primary key, no visibility join.
    const authorRead = calls(old.prisma).find((c) => c.select);
    expect(authorRead?.select).toEqual({ id: true, author_id: true });
    expect(authorRead?.where.status).toBeUndefined();
  });

  it('random worlds: same posts and next rank as the old rule', async () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let t = 0; t < 25; t += 1) {
      const n = 50 + Math.floor(rnd() * 600);
      const pick = (p: number) => new Set(ids(n).filter(() => rnd() < p));
      const w = world({
        n,
        hash: rnd() < 0.7,
        hidden: pick(0.1),
        seen: pick(0.3),
        followed: ['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6'].filter(
          () => rnd() < 0.3,
        ),
      });
      const limit = 5 + Math.floor(rnd() * 20);
      const page = await w.svc.page(viewer, undefined, limit);
      const want = w.expected(limit);
      expect(page.items.map((p) => p.id).slice(0, want.length)).toEqual(want);
    }
  });
});

describe('FeedService followed stream (row 64)', () => {
  it('checks the author rule once per followed author, posts without the join', async () => {
    const { svc, prisma } = build({ redis: fakeRedis({}) });
    prisma.follow.findMany.mockResolvedValue([
      { followee_id: 'att-1' },
      { followee_id: 'suspended-2' },
    ]);
    await svc.page(viewer, undefined, 10);
    const userWhere = prisma.user.findMany.mock.calls[0][0].where as Record<
      string,
      unknown
    >;
    expect(userWhere).toEqual({
      ...(VISIBLE_POST_WHERE.author as object),
      id: { in: ['att-1', 'suspended-2'] },
    });
    const stream = prisma.post.findMany.mock.calls
      .map((c) => c[0])
      .find((c) => c.where.author_id);
    expect(stream?.where.author_id).toEqual({ in: ['att-1'] });
    expect(stream?.where.author).toBeUndefined();
    expect(stream?.where).toMatchObject({
      status: 'published',
      deleted_at: null,
      archived_at: null,
    });
  });

  it('no shown author: no posts read for the stream', async () => {
    const { svc, prisma } = build({ redis: fakeRedis({}) });
    prisma.follow.findMany.mockResolvedValue([{ followee_id: 'suspended-1' }]);
    await svc.page(viewer, undefined, 10);
    const stream = prisma.post.findMany.mock.calls
      .map((c) => c[0])
      .find((c) => c.where.author_id);
    expect(stream).toBeUndefined();
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
    prisma.postRepost.findFirst.mockResolvedValue({ id: 'r1' });
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
  it('no repost in the window: the joined read is skipped (row 64)', async () => {
    const { svc, prisma } = build({ redis: fakeRedis({}) });
    const out = await (
      svc as unknown as {
        repostsInWindow: (...a: unknown[]) => Promise<unknown[]>;
      }
    ).repostsInWindow(
      viewer,
      ['x', 'viewer'],
      new Date(2),
      new Date(1),
      {},
      new Set(),
    );
    expect(out).toEqual([]);
    expect(prisma.postRepost.findMany).not.toHaveBeenCalled();
    expect(prisma.postRepost.findFirst.mock.calls[0][0]).toEqual({
      where: {
        user_id: { in: ['x'] },
        created_at: { lt: new Date(2), gt: new Date(1) },
      },
      select: { id: true },
    });
  });
});
