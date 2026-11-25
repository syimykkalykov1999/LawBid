import { encodeFeedCursor } from './feed-mixer';
import {
  FeedService,
  postsBefore,
  recoAuthorsKey,
  recoCurrentKey,
  recoKey,
} from './feed.service';
import { VISIBLE_POST_WHERE } from '../posts/post-presenter.service';

/** Algo audit 2026-10-27 (CONTENT H-3, M-3, M-4) — FeedService over fakes. */
function fakeRedis(seed: {
  snapshot?: string[];
  seen?: Set<string>;
  /** When each seen id was seen (ms); default 1 (long ago). */
  seenAt?: Record<string, number>;
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
      Promise.resolve(
        ids.map((id) =>
          seed.seen?.has(id) ? String(seed.seenAt?.[id] ?? 1) : null,
        ),
      ),
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
  timeline?: { followed: jest.Mock };
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
    opts.timeline as never,
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
    // 18.11: the cursor carries when the scroll started (FeedCursor.s).
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1_795_000_000_000);
    const a = await old.svc.page(viewer, undefined, 10);
    const b = await now.svc.page(viewer, undefined, 10);
    clock.mockRestore();
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

/** The `where` of every post.findMany call, as plain records (the mock's
 * inferred arg type only knows the first call's shape). */
function postWheres(prisma: {
  post: { findMany: { mock: { calls: unknown[][] } } };
}): Record<string, unknown>[] {
  return prisma.post.findMany.mock.calls.map(
    (c) => ((c[0] ?? {}) as { where?: Record<string, unknown> }).where ?? {},
  );
}

/** The followed-stream read: its rule is the first `AND` item (R2 review:
 * the cursor is a separate item, never spread into the rule). */
function streamWhere(prisma: {
  post: { findMany: { mock: { calls: unknown[][] } } };
}): Record<string, unknown> | undefined {
  for (const w of postWheres(prisma)) {
    if (w.author_id) return w;
    const first = (w.AND as Record<string, unknown>[] | undefined)?.[0];
    if (first?.author_id) return first;
  }
  return undefined;
}

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
    // 18.11: the viewer's own posts are in every role's stream.
    expect(userWhere).toEqual({
      ...(VISIBLE_POST_WHERE.author as object),
      id: { in: ['att-1', 'suspended-2', 'viewer'] },
    });
    const stream = streamWhere(prisma);
    expect(stream?.author_id).toEqual({ in: ['att-1', 'viewer'] });
    expect(stream?.author).toBeUndefined();
    expect(stream).toMatchObject({
      status: 'published',
      deleted_at: null,
      archived_at: null,
    });
  });

  it('no shown author: no posts read for the stream', async () => {
    const { svc, prisma } = build({ redis: fakeRedis({}) });
    prisma.follow.findMany.mockResolvedValue([{ followee_id: 'suspended-1' }]);
    const suspended = { sub: 'suspended-me', role: 'client' } as never;
    await svc.page(suspended, undefined, 10);
    const stream = streamWhere(prisma);
    expect(stream).toBeUndefined();
  });

  it('18.11 a client’s own post is in their feed’s page 1 (pull to refresh keeps what they just published)', async () => {
    const { svc, prisma } = build({ redis: fakeRedis({}) });
    await svc.page(viewer, undefined, 10);
    expect(streamWhere(prisma)?.author_id).toEqual({ in: ['viewer'] });
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

describe('FeedService keyset cursor is an index range (row 126)', () => {
  // EXPLAIN ANALYZE, 300 000 posts (docs/perf/FEED_TAIL_2026-11-14.md):
  // `created_at < t OR (created_at = t AND id < id)` alone is a Filter on
  // posts_visible_created_idx — every tail page read the index from the
  // newest post down to the cursor (290 001 rows removed, 259 ms at depth
  // 290 000). With `created_at <= t` next to it the same rows come from an
  // Index Cond range (2.2 ms).
  const t = '2026-10-01T12:00:00.000Z';
  const bounded = (w: unknown) =>
    JSON.stringify(w).includes(
      JSON.stringify({ created_at: { lte: new Date(t) } }),
    );

  it('a tail page bounds created_at by the cursor time', async () => {
    const { svc, prisma } = build({ redis: fakeRedis({}) });
    const cursor = encodeFeedCursor({
      f: null,
      r: 0,
      v: null,
      l: { t, id: 'p9' },
    });
    await svc.page(viewer, cursor, 10);
    const tail = postWheres(prisma).find((w) => 'AND' in w);
    expect(tail).toBeDefined();
    expect(bounded(tail)).toBe(true);
  });

  it('a later page of the followed stream bounds created_at too', async () => {
    const { svc, prisma } = build({ redis: fakeRedis({}) });
    prisma.follow.findMany.mockResolvedValue([{ followee_id: 'att-1' }]);
    const cursor = encodeFeedCursor({ f: { t, id: 'p9' }, r: 0, v: null });
    await svc.page(viewer, cursor, 10);
    const stream = postWheres(prisma).find(
      (w) =>
        (w.AND as Record<string, unknown>[] | undefined)?.[0]?.author_id !==
        undefined,
    );
    expect(bounded(stream)).toBe(true);
  });

  it('R2 review: the cursor is its own AND item next to the visibility rule, never spread into it', async () => {
    const { svc, prisma } = build({ redis: fakeRedis({}) });
    prisma.follow.findMany.mockResolvedValue([{ followee_id: 'att-1' }]);
    const cursor = encodeFeedCursor({ f: { t, id: 'p9' }, r: 0, v: null });
    await svc.page(viewer, cursor, 10);
    const stream = postWheres(prisma).find(
      (w) =>
        (w.AND as Record<string, unknown>[] | undefined)?.[0]?.author_id !==
        undefined,
    );
    const and = stream?.AND as Record<string, unknown>[];
    expect(Object.keys(stream ?? {})).toEqual(['AND']);
    expect(and).toHaveLength(2);
    expect(and[0]).toMatchObject({
      status: 'published',
      deleted_at: null,
      archived_at: null,
      author_id: { in: ['att-1', 'viewer'] },
    });
    expect(and[1]).toEqual(postsBefore({ t, id: 'p9' }));
  });

  it('selects exactly the rows of the old OR rule', () => {
    const when = (h: number) => new Date(Date.UTC(2026, 9, 1, h));
    const rows = Array.from({ length: 400 }, (_, i) => ({
      created_at: when(i % 7),
      id: `id-${String((i * 37) % 400).padStart(3, '0')}`,
    }));
    const matches = (
      w: Record<string, unknown>,
      r: { created_at: Date; id: string },
    ): boolean => {
      if (Array.isArray(w.AND))
        return (w.AND as Record<string, unknown>[]).every((x) => matches(x, r));
      if (Array.isArray(w.OR))
        return (w.OR as Record<string, unknown>[]).some((x) => matches(x, r));
      const c = w.created_at as Date | { lt?: Date; lte?: Date };
      const ok =
        c instanceof Date
          ? r.created_at.getTime() === c.getTime()
          : (c.lt === undefined || r.created_at < c.lt) &&
            (c.lte === undefined || r.created_at <= c.lte);
      const id = w.id as { lt: string } | undefined;
      return ok && (id === undefined || r.id < id.lt);
    };
    for (let h = 0; h < 7; h++) {
      for (const id of ['id-000', 'id-150', 'id-399']) {
        const after = { t: when(h).toISOString(), id };
        const old = rows.filter(
          (r) =>
            r.created_at < when(h) ||
            (r.created_at.getTime() === when(h).getTime() && r.id < id),
        );
        const now = rows.filter((r) => matches(postsBefore(after), r));
        expect(now).toEqual(old);
      }
    }
  });
});

/** 18.11 (owner: on pull to refresh old posts came on top, new ones at the
 * bottom, some vanished). */
describe('FeedService refresh order (18.11)', () => {
  const tailWhere = (prisma: ReturnType<typeof build>['prisma']) =>
    postWheres(prisma).find(
      (w) =>
        Array.isArray(w.AND) &&
        (w.AND as Record<string, { notIn?: unknown }>[]).some(
          (x) => x.author_id?.notIn !== undefined,
        ),
    );
  const notIn = (w: Record<string, unknown> | undefined): string[] => {
    const item = (w?.AND as Record<string, unknown>[] | undefined)?.find(
      (x) => 'id' in x,
    ) as { id: { notIn: string[] } } | undefined;
    return item?.id.notIn ?? [];
  };

  it('a recommendation seen on an earlier visit comes back in the tail (it never vanishes)', async () => {
    const redis = fakeRedis({
      snapshot: ['p0', 'p1', 'p2'],
      seen: new Set(['p0', 'p1', 'p2']),
    });
    const { svc, prisma } = build({ redis });
    await svc.page(viewer, undefined, 10);
    const tail = tailWhere(prisma);
    expect(tail).toBeDefined();
    expect(notIn(tail)).not.toEqual(expect.arrayContaining(['p0', 'p1', 'p2']));
  });

  it('every recommendation seen: no reset that puts the old ranked posts back on top', async () => {
    const redis = fakeRedis({
      snapshot: ['p0', 'p1'],
      seen: new Set(['p0', 'p1']),
    });
    const { svc } = build({ redis });
    const page = await svc.page(viewer, undefined, 10);
    // The seen set is kept: the page is the newest-first tail, not the
    // snapshot from its top again.
    expect(redis.del).not.toHaveBeenCalledWith('feed:seen:viewer');
    expect(page.items.map((p) => p.id)).toEqual([]);
  });

  it('within one scroll the tail never repeats what this scroll already served', async () => {
    const redis = fakeRedis({
      snapshot: ['p0', 'p1'],
      seen: new Set(['p0', 'p1']),
      seenAt: { p0: 5_000, p1: 500 },
    });
    const { svc, prisma } = build({ redis });
    const cursor = encodeFeedCursor({
      f: null,
      r: 2,
      v: 'v1',
      l: { t: '2026-10-01T12:00:00.000Z', id: 'x' },
      s: 1_000,
    });
    await svc.page(viewer, cursor, 10);
    const ex = notIn(tailWhere(prisma));
    // p0 was served in this scroll (seen after it started): left out;
    // p1 was seen on an earlier visit: may show again lower down.
    expect(ex).toContain('p0');
    expect(ex).not.toContain('p1');
  });
});

describe('FeedService precomputed timeline (item 23, F1)', () => {
  const at = (m: number) =>
    new Date(Date.parse('2026-11-25T12:00:00Z') - m * 60_000);
  const row = (id: string, m: number) => ({
    id,
    author_id: 'att-1',
    created_at: at(m),
  });

  it('takes the followed stream from the timeline when it answers (no stream read)', async () => {
    const followed = jest
      .fn()
      .mockResolvedValue([row('t1', 1), row('t2', 2), row('t3', 3)]);
    const { svc, prisma } = build({
      redis: fakeRedis({}),
      timeline: { followed },
    });
    const since = new Date('2026-11-20T00:00:00Z');
    prisma.follow.findMany.mockResolvedValue([
      { followee_id: 'att-1', created_at: since },
    ]);
    const page = await svc.page(viewer, undefined, 10);
    expect(page.items.slice(0, 3).map((p) => p.id)).toEqual(['t1', 't2', 't3']);
    expect(streamWhere(prisma)).toBeUndefined();
    const q = followed.mock.calls[0][0] as {
      tokens: Map<string, string>;
      shown: string[];
      take: number;
      after: unknown;
      where: Record<string, unknown>;
    };
    // The follow token is the follow's time: a re-follow is a new token.
    expect(q.tokens.get('att-1')).toBe(String(since.getTime()));
    expect(q.tokens.get('viewer')).toBe('self');
    expect(q.shown).toEqual(['att-1', 'viewer']);
    expect(q.take).toBe(11);
    expect(q.after).toBeNull();
    // The post half of the visibility rule, never the author join.
    expect(q.where).toMatchObject({ status: 'published', deleted_at: null });
    expect(q.where.author).toBeUndefined();
  });

  it('a timeline that cannot answer (null) leaves the database read exactly as before', async () => {
    const followed = jest.fn().mockResolvedValue(null);
    const { svc, prisma } = build({
      redis: fakeRedis({}),
      timeline: { followed },
    });
    prisma.follow.findMany.mockResolvedValue([
      { followee_id: 'att-1', created_at: new Date() },
    ]);
    await svc.page(viewer, undefined, 10);
    expect(followed).toHaveBeenCalledTimes(1);
    expect(streamWhere(prisma)?.author_id).toEqual({ in: ['att-1', 'viewer'] });
  });
});
