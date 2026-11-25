import {
  FANOUT_EPOCH_KEY,
  FANOUT_SKIP_KEY,
  FeedTimelineService,
  timelineKey,
  timelineMetaKey,
  type FollowedQuery,
} from './feed-timeline.service';

/** Item 23 (F1): when the precomputed timeline may answer, and when the
 * feed must fall back to the database read — over fakes. */

const T0 = Date.parse('2026-11-25T12:00:00.000Z');
const MIN = 60_000;
const VIEWER = 'viewer';

interface Entry {
  id: string;
  author: string;
  at: number;
}

function harness(opts: {
  mode?: 'off' | 'on' | 'auto';
  entries?: Entry[];
  covered?: Record<string, string>;
  epoch?: string | null;
  floor?: number;
  sentinel?: boolean;
  high?: string[];
  pending?: Entry[];
  /** Posts the database has (visible), by id. */
  db?: Entry[];
}) {
  const entries = [...(opts.entries ?? [])].sort((a, b) => b.at - a.at);
  const meta: Record<string, string | null> = {
    _e: opts.epoch === undefined ? 'E1' : opts.epoch,
    _f: String(opts.floor ?? 0),
    ...(opts.covered ?? {}),
  };
  const db = opts.db ?? entries;
  const cache = {
    hmget: jest.fn((k: string, ...f: string[]) =>
      Promise.resolve(
        k === timelineMetaKey(VIEWER) ? f.map((x) => meta[x] ?? null) : [],
      ),
    ),
    zscore: jest.fn((k: string) =>
      Promise.resolve(
        k === timelineKey(VIEWER) && opts.sentinel !== false ? '0' : null,
      ),
    ),
    zrevrangebyscore: jest.fn(
      (
        _k: string,
        max: string,
        min: string,
        _w: string,
        _l: string,
        off: number,
        n: number,
      ) => {
        const hi = max === '+inf' ? Infinity : Number(max);
        const lo = Number(min);
        const out = entries
          .filter((e) => e.at <= hi && e.at >= lo)
          .slice(off, off + n)
          .flatMap((e) => [`${e.id}:${e.author}`, String(e.at)]);
        return Promise.resolve(out);
      },
    ),
    expire: jest.fn().mockResolvedValue(1),
    eval: jest.fn().mockResolvedValue(1),
    hget: jest.fn().mockResolvedValue('0'),
    hset: jest.fn().mockResolvedValue(1),
  };
  const redis = {
    hmget: jest.fn((k: string) =>
      Promise.resolve(k === FANOUT_EPOCH_KEY ? ['E1', '10000'] : [null, null]),
    ),
    eval: jest.fn().mockResolvedValue('E1'),
    smismember: jest.fn((k: string, ...ids: string[]) =>
      Promise.resolve(
        ids.map((id) =>
          k === FANOUT_SKIP_KEY && opts.high?.includes(id) ? 1 : 0,
        ),
      ),
    ),
    zrangebyscore: jest
      .fn()
      .mockResolvedValue(
        (opts.pending ?? []).map((e) => `${e.id}:${e.author}`),
      ),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };
  const findMany = jest.fn(
    (args: {
      where: { AND: Array<Record<string, unknown>> };
      take: number;
    }) => {
      // A background build reads without the feed rule: nothing to add.
      if (!args.where.AND) return Promise.resolve([]);
      // The fake honours: candidate ids of low authors OR high authors,
      // before the cursor; newest first; take.
      const part = args.where.AND[1] as {
        OR?: Array<{ id?: { in: string[] }; author_id: { in: string[] } }>;
        id?: { in: string[] };
        author_id?: { in: string[] };
      };
      const parts = part.OR ?? [part];
      // No test here pages with a cursor (the e2e suite does).
      const lt = Infinity;
      const rows = db
        .filter((p) =>
          parts.some(
            (q) =>
              q.author_id!.in.includes(p.author) &&
              (!q.id || q.id.in.includes(p.id)),
          ),
        )
        .filter((p) => p.at < lt)
        .sort((a, b) => b.at - a.at)
        .slice(0, args.take)
        .map((p) => ({
          id: p.id,
          author_id: p.author,
          created_at: new Date(p.at),
        }));
      return Promise.resolve(rows);
    },
  );
  const prisma = { post: { findMany } };
  const settings = {
    raw: jest.fn((k: string) =>
      Promise.resolve(
        k === 'feed.fanout_mode' ? (opts.mode ?? 'on') : undefined,
      ),
    ),
    number: jest.fn((k: string) =>
      Promise.resolve(
        k === 'feed.fanout_max_followers'
          ? 10000
          : k === 'feed.fanout_timeline_len'
            ? 800
            : 7,
      ),
    ),
  };
  const svc = new FeedTimelineService(
    prisma as never,
    redis as never,
    { get: () => undefined } as never,
    settings as never,
    cache as never,
  );
  return { svc, findMany, cache, redis };
}

const q = (over: Partial<FollowedQuery> = {}): FollowedQuery => ({
  viewerId: VIEWER,
  tokens: new Map([
    ['A', '1'],
    ['B', '2'],
    ['STAR', '3'],
    [VIEWER, 'self'],
  ]),
  shown: ['A', 'B', VIEWER],
  where: {},
  after: null,
  take: 4,
  ...over,
});

const posts = (author: string, n: number, start: number, step: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${author}-${i}`,
    author,
    at: start - i * step,
  }));

const covered = { A: '1', B: '2', [VIEWER]: 'self', STAR: '3' };

describe('FeedTimelineService.followed', () => {
  it('off: never read (the database read stays)', async () => {
    const h = harness({
      mode: 'off',
      entries: posts('A', 3, T0, MIN),
      covered,
    });
    expect(await h.svc.followed(q())).toBeNull();
    expect(h.cache.zrevrangebyscore).not.toHaveBeenCalled();
  });

  it('auto without the job queue: off', async () => {
    const h = harness({
      mode: 'auto',
      entries: posts('A', 3, T0, MIN),
      covered,
    });
    expect(await h.svc.followed(q())).toBeNull();
  });

  it('a cold timeline (other epoch, or evicted) falls back and is built behind', async () => {
    for (const cold of [{ epoch: 'OLD' }, { sentinel: false }]) {
      const h = harness({ ...cold, entries: posts('A', 3, T0, MIN), covered });
      expect(await h.svc.followed(q())).toBeNull();
      await h.svc.settled();
      // RESET_LUA ran for this reader.
      expect(h.cache.eval).toHaveBeenCalledWith(
        expect.stringContaining('DEL'),
        2,
        timelineKey(VIEWER),
        timelineMetaKey(VIEWER),
        'E1',
        7 * 86_400,
      );
    }
  });

  it('a followed author not covered yet (new follow, re-follow) falls back', async () => {
    const h = harness({
      entries: posts('A', 3, T0, MIN),
      covered: { ...covered, B: 'older-follow' },
    });
    expect(await h.svc.followed(q())).toBeNull();
  });

  it('serves the same rows as the read when the timeline reaches past the page', async () => {
    const all = [...posts('A', 6, T0, MIN), ...posts('B', 6, T0 - 30_000, MIN)];
    const h = harness({ entries: all, covered });
    const rows = await h.svc.followed(q());
    const want = [...all]
      .sort((a, b) => b.at - a.at)
      .slice(0, 4)
      .map((p) => p.id);
    expect(rows?.map((r) => r.id)).toEqual(want);
  });

  it('merges a high-follower author read at open time', async () => {
    const low = posts('A', 6, T0, 10 * MIN);
    const star = posts('STAR', 3, T0 - 5 * MIN, 10 * MIN);
    const h = harness({
      entries: low,
      db: [...low, ...star],
      covered,
      high: ['STAR'],
    });
    const rows = await h.svc.followed(q({ shown: ['A', 'STAR', VIEWER] }));
    const want = [...low, ...star].sort((a, b) => b.at - a.at).slice(0, 4);
    expect(rows?.map((r) => r.id)).toEqual(want.map((p) => p.id));
    expect(rows?.some((r) => r.author_id === 'STAR')).toBe(true);
  });

  it('a post whose fan-out is still pending is on the page', async () => {
    const h = harness({
      entries: posts('A', 6, T0, MIN),
      pending: [{ id: 'A-new', author: 'A', at: T0 + MIN }],
      db: [
        ...posts('A', 6, T0, MIN),
        { id: 'A-new', author: 'A', at: T0 + MIN },
      ],
      covered,
    });
    const rows = await h.svc.followed(q());
    expect(rows?.[0].id).toBe('A-new');
  });

  it('a page that reaches below the trimmed timeline falls back', async () => {
    // Only 3 entries kept, the floor says older posts may be missing.
    const kept = posts('A', 3, T0, MIN);
    const h = harness({
      entries: kept,
      db: posts('A', 10, T0, MIN),
      floor: kept[2].at,
      covered,
    });
    expect(await h.svc.followed(q())).toBeNull();
  });

  it('a complete timeline answers a short last page', async () => {
    const h = harness({ entries: posts('A', 2, T0, MIN), covered });
    const rows = await h.svc.followed(q());
    expect(rows?.map((r) => r.id)).toEqual(['A-0', 'A-1']);
  });

  it('deleted rows never come back: the database decides visibility', async () => {
    const all = posts('A', 8, T0, MIN);
    const h = harness({
      entries: all,
      db: all.filter((p) => p.id !== 'A-1'),
      covered,
    });
    const rows = await h.svc.followed(q());
    expect(rows?.map((r) => r.id)).toEqual(['A-0', 'A-2', 'A-3', 'A-4']);
  });

  it('a cache error is the database read, never an error page', async () => {
    const h = harness({ entries: posts('A', 3, T0, MIN), covered });
    h.cache.zrevrangebyscore.mockRejectedValueOnce(new Error('down'));
    expect(await h.svc.followed(q())).toBeNull();
  });
});
