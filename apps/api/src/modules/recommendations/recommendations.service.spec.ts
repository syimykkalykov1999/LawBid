import { shardContext } from '../../sharding/shard-context';
import {
  RecommendationsService,
  hashOf,
  normalizeInterests,
  postKind,
} from './recommendations.service';

const NOW = Date.now();
const DAY = 24 * 3600 * 1000;

function makeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    set: jest.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve('OK');
    }),
    del: jest.fn((k: string) => {
      store.delete(k);
      return Promise.resolve(1);
    }),
  };
}

function person(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    rating_avg: 4.5,
    rating_count: 20,
    followers_count: 50,
    trust_level: 1,
    trust_badge: false,
    posts_30d: 2,
    last_post_at: new Date(NOW - 3 * DAY),
    states: ['CA'],
    categories: ['tax'],
    mutual: 0,
    follows_viewer: false,
    engaged: 0,
    contact: 0,
    ...over,
  };
}

/** $queryRaw answers by the shape of the SQL text. */
function makePrisma(parts: {
  people?: ReturnType<typeof person>[];
  viewer?: { ui_language: string; lic: string[] | null; cstate: string | null };
  interests?: { category: string; weight: number }[];
  seen?: string[];
  posts?: unknown[];
  following?: string[];
}) {
  const queryRaw = jest.fn((strings: TemplateStringsArray) => {
    const sql = strings.join('?');
    if (sql.includes('FROM attorney_profiles a')) {
      return Promise.resolve(parts.people ?? []);
    }
    if (sql.includes('FROM users u WHERE')) {
      return Promise.resolve([
        parts.viewer ?? { ui_language: 'en', lic: ['NJ'], cstate: null },
      ]);
    }
    if (sql.includes('GROUP BY category')) {
      return Promise.resolve(parts.interests ?? []);
    }
    if (sql.includes('post_views')) {
      return Promise.resolve((parts.seen ?? []).map((id) => ({ id })));
    }
    return Promise.resolve([]);
  });
  return {
    $queryRaw: queryRaw,
    post: { findMany: jest.fn().mockResolvedValue(parts.posts ?? []) },
    follow: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          (parts.following ?? []).map((followee_id) => ({ followee_id })),
        ),
    },
  };
}

const svc = (prisma: unknown, redis = makeRedis()) =>
  new RecommendationsService(prisma as never, redis as never);

describe('normalizeInterests', () => {
  it('sums per category and scales the strongest to 1', () => {
    const m = normalizeInterests([
      { category: 'a', weight: 3 },
      { category: 'a', weight: 1 },
      { category: 'b', weight: 2 },
    ]);
    expect(m.get('a')).toBe(1);
    expect(m.get('b')).toBe(0.5);
  });

  it('nothing known → empty (cold start)', () => {
    expect(normalizeInterests([]).size).toBe(0);
  });
});

describe('postKind', () => {
  it('video → reel, media → photo, otherwise brief', () => {
    expect(postKind('v', 0)).toBe('reel');
    expect(postKind(null, 2)).toBe('photo');
    expect(postKind(null, 0)).toBe('brief');
  });
});

describe('hashOf', () => {
  it('stable, short, no raw text', () => {
    expect(hashOf({ a: 1 })).toBe(hashOf({ a: 1 }));
    expect(hashOf({ a: 1 })).not.toBe(hashOf({ a: 2 }));
    expect(hashOf({ q: 'secret' })).not.toContain('secret');
  });
});

describe('RecommendationsService.peopleFor', () => {
  it('puts same-state, same-practice, well-connected people first', async () => {
    const prisma = makePrisma({
      viewer: { ui_language: 'en', lic: null, cstate: 'NJ' },
      interests: [{ category: 'family', weight: 3 }],
      people: [
        person('plain'),
        person('local-family', { states: ['NJ'], categories: ['family'] }),
        person('friend-of-friends', { mutual: 5 }),
      ],
    });
    const ids = await svc(prisma).peopleFor('viewer');
    expect(ids[0]).toBe('local-family');
    expect(ids).toHaveLength(3);
    expect(ids.indexOf('friend-of-friends')).toBeLessThan(ids.indexOf('plain'));
  });

  it('a person from my contacts leads (20% signal)', async () => {
    const prisma = makePrisma({
      people: [
        person('plain'),
        person('great', { rating_avg: 4.9, rating_count: 80, posts_30d: 9 }),
        person('in-contacts', { contact: 1 }),
      ],
    });
    const ids = await svc(prisma).peopleFor('viewer');
    expect(ids[0]).toBe('in-contacts');
  });

  it('is cached per viewer', async () => {
    const redis = makeRedis();
    const prisma = makePrisma({ people: [person('a')] });
    const s = svc(prisma, redis);
    await s.peopleFor('v1');
    const calls = prisma.$queryRaw.mock.calls.length;
    await s.peopleFor('v1');
    expect(prisma.$queryRaw.mock.calls.length).toBe(calls);
    expect(redis.store.has('reco:people:v1')).toBe(true);
    await s.peopleFor('v2');
    expect(prisma.$queryRaw.mock.calls.length).toBeGreaterThan(calls);
  });

  // Shard-ready: attorney_profiles / users are GLOBAL family — the
  // candidates are read on the primary database even inside the viewer's
  // shard context (the two-DB e2e got 0 candidates on the shard database).
  it('reads the candidates on the primary database, not the viewer shard', async () => {
    const prisma = makePrisma({ people: [person('a')] });
    const seen: (string | undefined)[] = [];
    const inner = prisma.$queryRaw.getMockImplementation()!;
    prisma.$queryRaw.mockImplementation((strings: TemplateStringsArray) => {
      if (strings.join('?').includes('FROM attorney_profiles a')) {
        seen.push(shardContext.current()?.physical);
      }
      return inner(strings);
    });
    const ids = await shardContext.runOnPhysical('db1', () =>
      svc(prisma).peopleFor('viewer'),
    );
    expect(ids).toEqual(['a']);
    expect(seen).toEqual(['primary']);
  });

  it('a viewer with no signals still gets a list (quality / activity)', async () => {
    const prisma = makePrisma({
      viewer: { ui_language: 'en', lic: null, cstate: null },
      people: [
        person('quiet', { posts_30d: 0, last_post_at: null, rating_avg: 3 }),
        person('great', { rating_avg: 4.9, rating_count: 80, posts_30d: 9 }),
      ],
    });
    const ids = await svc(prisma).peopleFor('new-user');
    expect(ids[0]).toBe('great');
  });
});

describe('RecommendationsService.peopleAffinity', () => {
  it('scores exactly the given ids; no ids → no query', async () => {
    const prisma = makePrisma({
      interests: [{ category: 'tax', weight: 1 }],
      people: [person('a'), person('b', { categories: ['other'] })],
    });
    const s = svc(prisma);
    const m = await s.peopleAffinity('viewer', ['a', 'b']);
    expect(m.get('a')!).toBeGreaterThan(m.get('b')!);
    prisma.$queryRaw.mockClear();
    expect((await s.peopleAffinity('viewer', [])).size).toBe(0);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('RecommendationsService.postsAffinity (owner 26.11)', () => {
  const post = (id: string, author: string, category: string) => ({
    id,
    author_id: author,
    created_at: new Date(NOW - 5 * 3600 * 1000),
    like_count: 5,
    comment_count: 1,
    save_count: 0,
    share_count: 0,
    view_count: 10,
    language: 'en',
    video_asset_id: null,
    practice_area: { id: `leaf-${category}`, parent_id: category },
    _count: { media: 1 },
  });

  it('the «Для вас» formula over exactly the ids: followed author and interest lead', async () => {
    const prisma = makePrisma({
      interests: [{ category: 'tax', weight: 1 }],
      following: ['F'],
      posts: [post('liked', 'F', 'tax'), post('plain', 'X', 'other')],
    });
    const redis = makeRedis();
    const m = await svc(prisma, redis).postsAffinity('viewer', [
      'plain',
      'liked',
      'gone',
    ]);
    expect(m.get('liked')!).toBeGreaterThan(m.get('plain')!);
    // A post deleted since the search ran simply has no score.
    expect(m.has('gone')).toBe(false);
    expect(redis.set).not.toHaveBeenCalled();
    prisma.post.findMany.mockClear();
    expect((await svc(prisma).postsAffinity('viewer', [])).size).toBe(0);
    expect(prisma.post.findMany).not.toHaveBeenCalled();
  });
});

describe('RecommendationsService.postsFor', () => {
  const post = (
    id: string,
    author: string,
    over: Record<string, unknown> = {},
  ) => ({
    id,
    author_id: author,
    created_at: new Date(NOW - 5 * 3600 * 1000),
    like_count: 5,
    comment_count: 1,
    save_count: 0,
    share_count: 0,
    view_count: 10,
    language: 'en',
    video_asset_id: null,
    practice_area: { id: 'leaf', parent_id: 'tax' },
    _count: { media: 1 },
    ...over,
  });

  it('drops the viewer’s own posts and spreads one author out', async () => {
    const prisma = makePrisma({
      posts: [
        post('mine', 'viewer', { like_count: 999 }),
        post('a1', 'A', { like_count: 90 }),
        post('a2', 'A', { like_count: 80 }),
        post('a3', 'A', { like_count: 70 }),
        post('b1', 'B', { like_count: 20, video_asset_id: 'vid' }),
        post('c1', 'C', { like_count: 15, _count: { media: 0 } }),
      ],
    });
    const ids = await svc(prisma).postsFor('viewer', {}, { f: 1 });
    expect(ids).not.toContain('mine');
    expect(ids).toHaveLength(5);
    // The three posts of A are not the first three.
    expect(ids.slice(0, 3)).not.toEqual(['a1', 'a2', 'a3']);
    expect(ids[0]).toBe('a1');
  });

  it('seen posts go lower', async () => {
    const prisma = makePrisma({
      seen: ['p-seen'],
      posts: [post('p-seen', 'A'), post('p-new', 'B')],
    });
    const ids = await svc(prisma).postsFor('viewer', {}, 'x');
    expect(ids).toEqual(['p-new', 'p-seen']);
  });

  it('empty candidates → empty list, no further queries', async () => {
    const prisma = makePrisma({ posts: [] });
    expect(await svc(prisma).postsFor('viewer', {}, 'k')).toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('cache key depends on viewer and filters', async () => {
    const redis = makeRedis();
    const prisma = makePrisma({ posts: [post('p', 'A')] });
    const s = svc(prisma, redis);
    await s.postsFor('v', {}, { period: '7d' });
    await s.postsFor('v', {}, { period: '30d' });
    await s.postsFor('w', {}, { period: '7d' });
    expect(redis.store.size).toBe(3);
  });

  it('18.11 reels (includeOwn): the viewer’s unwatched own reel leads, a watched one stays in', async () => {
    const prisma = makePrisma({
      seen: ['mine-old'],
      posts: [
        post('a1', 'A', { like_count: 90, video_asset_id: 'v1' }),
        post('mine-new', 'viewer', { like_count: 0, video_asset_id: 'v2' }),
        post('mine-old', 'viewer', {
          like_count: 0,
          video_asset_id: 'v3',
          created_at: new Date(NOW - 50 * 3600 * 1000),
        }),
      ],
    });
    const ids = await svc(prisma).postsFor('viewer', {}, 'r', null, {
      includeOwn: true,
    });
    expect(ids[0]).toBe('mine-new');
    expect(ids).toEqual(expect.arrayContaining(['a1', 'mine-old']));
    expect(ids).toHaveLength(3);
  });

  it('18.11 the owner’s case: only own reels exist → the ranked list is not empty', async () => {
    const prisma = makePrisma({
      posts: [
        post('r1', 'viewer', { video_asset_id: 'v1' }),
        post('r2', 'viewer', { video_asset_id: 'v2' }),
      ],
    });
    expect(await svc(prisma).postsFor('viewer', {}, 'r')).toEqual([]);
    expect(
      await svc(prisma).postsFor('viewer', {}, 'r', null, {
        includeOwn: true,
      }),
    ).toEqual(['r1', 'r2']);
  });

  it('24.11 reels: a watched hot reel never comes before an unwatched one (TikTok: nothing seen while new ones are there)', async () => {
    const prisma = makePrisma({
      seen: ['hot'],
      posts: [
        post('hot', 'A', { like_count: 900, video_asset_id: 'v1' }),
        post('cold', 'B', { like_count: 0, video_asset_id: 'v2' }),
      ],
    });
    const reels = await svc(prisma).postsFor('viewer', {}, 'r', null, {
      includeOwn: true,
    });
    expect(reels).toEqual(['cold', 'hot']);
  });

  it('18.11 a bumped feed version (own post public, follow, block) rebuilds the list at once', async () => {
    const redis = makeRedis();
    const prisma = makePrisma({ posts: [post('p', 'A')] });
    const s = svc(prisma, redis);
    await s.postsFor('v', {}, 'k');
    prisma.post.findMany.mockResolvedValue([post('p', 'A'), post('q', 'B')]);
    expect(await s.postsFor('v', {}, 'k')).toEqual(['p']);
    redis.store.set('feed:ver:v', '123');
    expect(await s.postsFor('v', {}, 'k')).toHaveLength(2);
  });

  describe('F2: the learned ranker re-orders the formula’s best N for the model arm', () => {
    const posts = () => [
      post('hot', 'A', { like_count: 90 }),
      post('mid', 'B', { like_count: 40 }),
      post('low', 'C', { like_count: 5, video_asset_id: 'v' }),
      post('tail', 'D', { like_count: 0 }),
    ];
    const MODEL_ARM = { experimentKey: 'post_ranker', variant: 'model' };
    const fakeRanker = (answer: 'reverse' | 'fail', topN = 3) => {
      const seen: Record<string, number>[][] = [];
      return {
        seen,
        topN: jest.fn().mockResolvedValue(topN),
        score: jest.fn((rows: Record<string, number>[]) => {
          seen.push(rows);
          if (answer === 'fail') return Promise.resolve(null);
          // The model prefers what the formula liked least.
          return Promise.resolve(Float32Array.from(rows.map((_, i) => i)));
        }),
      };
    };
    const withRanker = (ranker: unknown) =>
      new RecommendationsService(
        makePrisma({ posts: posts() }) as never,
        makeRedis() as never,
        undefined,
        undefined,
        undefined,
        undefined,
        ranker as never,
      );

    it('model arm: the top 3 by the formula come back in the model order, the rest below', async () => {
      const ranker = fakeRanker('reverse');
      const ids = await withRanker(ranker).postsFor(
        'viewer',
        {},
        'm',
        MODEL_ARM,
      );
      expect(ids).toEqual(['low', 'mid', 'hot', 'tail']);
      // The model saw the logged-style rows: formula features + seen + kind.
      expect(ranker.seen[0][0]).toMatchObject({
        seen: 0,
        kind_photo: 1,
        kind_reel: 0,
      });
      expect(ranker.seen[0][2]).toMatchObject({ kind_reel: 1 });
      expect(typeof ranker.seen[0][0].hot).toBe('number');
    });

    it('control arm and no test: the formula, the model is never asked', async () => {
      const ranker = fakeRanker('reverse');
      const control = await withRanker(ranker).postsFor('viewer', {}, 'c', {
        experimentKey: 'post_ranker',
        variant: 'control',
      });
      const none = await withRanker(ranker).postsFor('viewer', {}, 'n');
      expect(control).toEqual(['hot', 'mid', 'low', 'tail']);
      expect(none).toEqual(control);
      expect(ranker.score).not.toHaveBeenCalled();
    });

    it('scoring failed (or no model): the formula order is served', async () => {
      const ranker = fakeRanker('fail');
      expect(
        await withRanker(ranker).postsFor('viewer', {}, 'f', MODEL_ARM),
      ).toEqual(['hot', 'mid', 'low', 'tail']);
      expect(ranker.score).toHaveBeenCalledTimes(1);
    });

    describe('owner 25.11: Feed → «Посты» (home feed window)', () => {
      const window = ['hot', 'mid', 'low', 'tail'];

      it('the model orders the whole window; the lead stays on top', async () => {
        const ranker = fakeRanker('reverse', 1);
        const out = await withRanker(ranker).rankHomeWindow(
          'viewer',
          ['tail', ...window.slice(0, 3)],
          new Set(['tail']),
          MODEL_ARM,
        );
        // The whole window (not top_n = 1), the model's order, lead first.
        expect(out?.ids).toEqual(['tail', 'low', 'mid', 'hot']);
        expect(ranker.seen[0]).toHaveLength(3);
        // The same rows Search «Для вас» scores and logs.
        expect(out?.rows.get('low')).toMatchObject({ kind_reel: 1, seen: 0 });
      });

      it('no model or scoring failed: null (the feed stays as it is)', async () => {
        expect(
          await withRanker(fakeRanker('fail')).rankHomeWindow(
            'viewer',
            window,
            new Set(),
            MODEL_ARM,
          ),
        ).toBeNull();
        expect(
          await new RecommendationsService(
            makePrisma({ posts: posts() }) as never,
            makeRedis() as never,
          ).rankHomeWindow('viewer', window, new Set(), MODEL_ARM),
        ).toBeNull();
      });

      it('served pages are logged on their own surface with the model input rows', async () => {
        const logList = jest.fn().mockResolvedValue(undefined);
        const events = {
          keepsImpressionsOf: jest.fn().mockResolvedValue(true),
          logList,
        };
        const s = new RecommendationsService(
          makePrisma({ posts: posts() }) as never,
          makeRedis() as never,
          undefined,
          undefined,
          undefined,
          events as never,
          fakeRanker('reverse') as never,
        );
        await s.logHomeServed('viewer', ['mid', 'hot'], 20, null);
        const list = logList.mock.calls[0][0] as {
          surface: string;
          offset: number;
          formulaVersion: string;
          features: Map<string, Record<string, number>>;
        };
        expect(list.surface).toBe('home_feed');
        expect(list.offset).toBe(20);
        expect(list.formulaVersion).toBe('home-2026-11');
        expect([...list.features.keys()].sort()).toEqual(['hot', 'mid']);
        expect(list.features.get('hot')).toMatchObject({ kind_photo: 1 });
        // Not in the impression sample: nothing read, nothing logged.
        events.keepsImpressionsOf.mockResolvedValue(false);
        await s.logHomeServed('viewer', ['mid'], 0, null);
        expect(logList).toHaveBeenCalledTimes(1);
      });
    });
  });
});

describe('RecommendationsService.casesFor', () => {
  const row = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    client_id: 'client',
    created_at: new Date(NOW - 4 * 3600 * 1000),
    practice_area_id: 'leaf-x',
    practice_area: { id: 'leaf-x', parent_id: 'cat-x' },
    primary_state_code: 'CA',
    states: [],
    budget_cents: 100_000,
    bids_count: 1,
    view_count: 5,
    comment_count: 0,
    urgency: 'soon',
    deadline_at: null,
    client_active_at: new Date(),
    ...over,
  });

  function casePrisma(rows: unknown[], bidOn: string[] = []) {
    const p = makePrisma({
      viewer: { ui_language: 'en', lic: ['NJ'], cstate: null },
    });
    return Object.assign(p, {
      case: { findMany: jest.fn().mockResolvedValue(rows) },
      attorneyPracticeArea: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ practice_area_id: 'leaf-own' }]),
      },
      bid: {
        findMany: jest
          .fn()
          .mockResolvedValue(bidOn.map((case_id) => ({ case_id }))),
      },
      clientProfile: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { user_id: 'client', rating_avg: 4.5, rating_count: 6 },
          ]),
      },
    });
  }

  it('own practice + licensed state first; own offers last', async () => {
    const prisma = casePrisma(
      [
        row('other'),
        row('mine', {
          practice_area_id: 'leaf-own',
          practice_area: { id: 'leaf-own', parent_id: 'cat-own' },
          primary_state_code: 'NJ',
        }),
        row('already-bid', {
          practice_area_id: 'leaf-own',
          practice_area: { id: 'leaf-own', parent_id: 'cat-own' },
          primary_state_code: 'NJ',
        }),
      ],
      ['already-bid'],
    );
    const ids = await svc(prisma).casesFor(
      'att',
      ['other', 'mine', 'already-bid'],
      {},
    );
    expect(ids[0]).toBe('mine');
    expect(ids[ids.length - 1]).toBe('already-bid');
  });

  it('no candidates → no work', async () => {
    const prisma = casePrisma([]);
    expect(await svc(prisma).casesFor('att', [], {})).toEqual([]);
    expect(prisma.case.findMany).not.toHaveBeenCalled();
  });

  it('owner 26.11: casesAffinity is the same formula over exactly the ids, nothing cached', async () => {
    const own = {
      practice_area_id: 'leaf-own',
      practice_area: { id: 'leaf-own', parent_id: 'cat-own' },
      primary_state_code: 'NJ',
    };
    const prisma = casePrisma(
      [row('other'), row('mine', own), row('already-bid', own)],
      ['already-bid'],
    );
    const redis = makeRedis();
    const m = await svc(prisma, redis).casesAffinity('att', [
      'other',
      'mine',
      'already-bid',
    ]);
    expect([...m.keys()].sort()).toEqual(['already-bid', 'mine', 'other']);
    // Same order as the attorney's cases feed (casesFor above).
    expect(m.get('mine')!).toBeGreaterThan(m.get('other')!);
    expect(m.get('other')!).toBeGreaterThan(m.get('already-bid')!);
    expect(redis.set).not.toHaveBeenCalled();
    prisma.case.findMany.mockClear();
    expect((await svc(prisma).casesAffinity('att', [])).size).toBe(0);
    expect(prisma.case.findMany).not.toHaveBeenCalled();
  });

  describe('owner 25.11: the case feed’s own learned ranker', () => {
    // Formula order: strong (own topic + licensed state) > mid > weak.
    const rows = () => [
      row('weak', { budget_cents: null, bids_count: 30 }),
      row('mid'),
      row('strong', {
        practice_area_id: 'leaf-own',
        practice_area: { id: 'leaf-own', parent_id: 'cat-own' },
        primary_state_code: 'NJ',
      }),
    ];
    const caseRanker = (
      arm: 'model' | 'control' | null,
      answer: 'reverse' | 'fail' = 'reverse',
    ) => {
      const seen: Record<string, number>[][] = [];
      return {
        seen,
        assign: jest
          .fn()
          .mockResolvedValue(
            arm ? { experimentKey: 'case_ranker', variant: arm } : null,
          ),
        topN: jest.fn().mockResolvedValue(10),
        formulaVersion: jest.fn().mockReturnValue('ranker:c1'),
        score: jest.fn((r: Record<string, number>[]) => {
          seen.push(r);
          if (answer === 'fail') return Promise.resolve(null);
          return Promise.resolve(Float32Array.from(r.map((_, i) => i)));
        }),
      };
    };
    const withCaseRanker = (ranker: unknown) =>
      new RecommendationsService(
        casePrisma(rows()) as never,
        makeRedis() as never,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        ranker as never,
      );
    const ids = ['weak', 'mid', 'strong'];

    it('model arm: the cases come in the model’s order (not the formula’s)', async () => {
      const formula = await svc(casePrisma(rows())).casesFor('att', ids, {});
      expect(formula).toEqual(['strong', 'mid', 'weak']);
      const r = caseRanker('model');
      const model = await withCaseRanker(r).casesFor('att', ids, {});
      expect(model).toEqual(['weak', 'mid', 'strong']);
      expect(model).not.toEqual(formula);
      // The model saw the formula's case features and «offer made» only:
      // nothing about who the client is.
      expect(Object.keys(r.seen[0][0]).sort()).toEqual(
        [
          'bidOn',
          'budget',
          'client',
          'clientActive',
          'competition',
          'dateNear',
          'demand',
          'fresh',
          'practice',
          'state',
          'urgency',
          'urgentActive',
        ].sort(),
      );
    });

    it('control arm, «Выкл» (no assignment) and a failed score: the formula', async () => {
      for (const r of [
        caseRanker('control'),
        caseRanker(null),
        caseRanker('model', 'fail'),
      ]) {
        expect(await withCaseRanker(r).casesFor('att', ids, {})).toEqual([
          'strong',
          'mid',
          'weak',
        ]);
      }
    });

    it('the hard filters stay before ranking: only the ids the SQL let through are read', async () => {
      const prisma = casePrisma(rows());
      const s = new RecommendationsService(
        prisma as never,
        makeRedis() as never,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        caseRanker('model') as never,
      );
      await s.casesFor('att', ['mid', 'weak'], {});
      expect(prisma.case.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['mid', 'weak'] } } }),
      );
    });
  });
});

describe('owner 25.11: the reels feed’s own learned ranker', () => {
  const reel = (
    id: string,
    author: string,
    over: Record<string, unknown> = {},
  ) => ({
    id,
    author_id: author,
    created_at: new Date(NOW - 5 * 3600 * 1000),
    like_count: 5,
    comment_count: 1,
    save_count: 0,
    share_count: 0,
    view_count: 10,
    language: 'en',
    video_asset_id: `v-${id}`,
    video_asset: { duration_sec: 30 },
    practice_area: { id: 'leaf', parent_id: 'tax' },
    _count: { media: 0 },
    ...over,
  });
  const reels = () => [
    reel('hot', 'A', { like_count: 90 }),
    reel('mid', 'B', { like_count: 40 }),
    reel('low', 'C', { like_count: 5, video_asset: { duration_sec: null } }),
  ];
  const fake = (key: string, arm: 'model' | null = 'model') => {
    const seen: Record<string, number>[][] = [];
    return {
      seen,
      assign: jest
        .fn()
        .mockResolvedValue(arm ? { experimentKey: key, variant: arm } : null),
      topN: jest.fn().mockResolvedValue(10),
      formulaVersion: jest.fn().mockReturnValue('ranker:r1'),
      score: jest.fn((r: Record<string, number>[]) => {
        seen.push(r);
        return Promise.resolve(Float32Array.from(r.map((_, i) => i)));
      }),
    };
  };
  const build = (posts: unknown, reelsR: unknown) =>
    new RecommendationsService(
      makePrisma({ posts: reels() }) as never,
      makeRedis() as never,
      undefined,
      undefined,
      undefined,
      undefined,
      posts as never,
      reelsR as never,
    );

  it('the reels feed is ranked by the reels model, with reel features; the posts model is not asked', async () => {
    const postsR = fake('post_ranker');
    const reelsR = fake('reel_ranker');
    const s = build(postsR, reelsR);
    const page = await s.postsForPage('viewer', {}, { reels: true }, 0, {
      includeOwn: true,
      feed: 'reel',
    });
    expect(reelsR.assign).toHaveBeenCalledWith('viewer');
    expect(postsR.assign).not.toHaveBeenCalled();
    expect(postsR.score).not.toHaveBeenCalled();
    expect(page.ids).toEqual(['low', 'mid', 'hot']);
    const row = reelsR.seen[0][0];
    for (const k of [
      'likeRate',
      'saveRate',
      'shareRate',
      'own',
      'seen',
      'views',
      'length',
    ])
      expect(row).toHaveProperty(k);
    // An unknown length stays missing for the model.
    expect(reelsR.seen[0].find((r) => r.length === undefined)).toBeDefined();
  });

  it('formula order without the reels model arm (or with «Выкл»)', async () => {
    const reelsR = fake('reel_ranker', null);
    const page = await build(undefined, reelsR).postsForPage(
      'viewer',
      {},
      { reels: true },
      0,
      { includeOwn: true, feed: 'reel' },
    );
    expect(page.ids).toEqual(['hot', 'mid', 'low']);
    expect(reelsR.score).not.toHaveBeenCalled();
  });

  it('a posts-model assignment never re-orders the reels (and the reverse)', async () => {
    const postsR = fake('post_ranker');
    const reelsR = fake('reel_ranker');
    const s = build(postsR, reelsR);
    const reelsWithPostsArm = await s.postsFor(
      'viewer',
      {},
      'x1',
      { experimentKey: 'post_ranker', variant: 'model' },
      { includeOwn: true, feed: 'reel' },
    );
    expect(reelsWithPostsArm).toEqual(['hot', 'mid', 'low']);
    const postsWithReelsArm = await s.postsFor('viewer', {}, 'x2', {
      experimentKey: 'reel_ranker',
      variant: 'model',
    });
    expect(postsWithReelsArm).toEqual(['hot', 'mid', 'low']);
    expect(postsR.score).not.toHaveBeenCalled();
    expect(reelsR.score).not.toHaveBeenCalled();
  });
});

describe('algo audit 2026-10-27 (CONTENT H-4): new attorneys are candidates', () => {
  const settingsOf = (stored: Record<string, unknown>) => ({
    number: jest.fn((k: string) =>
      Promise.resolve(stored[k] ?? (k === 'reco.people_newest' ? 200 : 0.1)),
    ),
    boolean: jest.fn((k: string) => Promise.resolve(stored[k] ?? true)),
  });
  /** The SQL text of every nested fragment of the people query. */
  const peopleSql = (prisma: ReturnType<typeof makePrisma>): string => {
    const call = prisma.$queryRaw.mock.calls.find((c) =>
      (c[0] as unknown as string[])
        .join('?')
        .includes('FROM attorney_profiles a'),
    ) as unknown[];
    const parts = [(call[0] as string[]).join('?')];
    for (const v of call.slice(1)) {
      if (v && typeof v === 'object' && 'sql' in v) {
        parts.push((v as { sql: string }).sql);
      }
    }
    return parts.join('\n');
  };

  it('by default unions the 600 best rated with the newest verified', async () => {
    const prisma = makePrisma({ people: [person('new', { rating_avg: 0 })] });
    const s = new RecommendationsService(
      prisma as never,
      makeRedis() as never,
      settingsOf({}) as never,
    );
    expect(await s.peopleFor('viewer')).toEqual(['new']);
    const sql = peopleSql(prisma);
    expect(sql).toContain('UNION');
    expect(sql).toContain('verified_at DESC');
  });

  it('reco.people_newest = 0 → the old best-rated-only scan', async () => {
    const prisma = makePrisma({ people: [] });
    const s = new RecommendationsService(
      prisma as never,
      makeRedis() as never,
      settingsOf({ 'reco.people_newest': 0 }) as never,
    );
    await s.peopleFor('viewer');
    expect(peopleSql(prisma)).not.toContain('verified_at DESC');
  });

  it('text-search affinity (ids) never adds the newest', async () => {
    const prisma = makePrisma({ people: [person('a')] });
    const s = new RecommendationsService(
      prisma as never,
      makeRedis() as never,
      settingsOf({}) as never,
    );
    await s.peopleAffinity('viewer', ['a']);
    expect(peopleSql(prisma)).not.toContain('verified_at DESC');
  });
});

describe('algo audit 2026-10-27 (CONTENT M-6): For-You paging is pinned', () => {
  const settingsOf = (pin: boolean) => ({
    number: jest.fn(() => Promise.resolve(0.1)),
    boolean: jest.fn(() => Promise.resolve(pin)),
  });

  it('later pages read the list the first page pinned, not a rebuilt one', async () => {
    const redis = makeRedis();
    const s = new RecommendationsService(
      {} as never,
      redis as never,
      settingsOf(true) as never,
    );
    const postsFor = jest
      .spyOn(s, 'postsFor')
      .mockResolvedValueOnce(['a', 'b', 'c'])
      .mockResolvedValueOnce(['z', 'a', 'b']);
    const first = await s.postsForPage('v', {}, 'k', 0);
    expect(first.ids).toEqual(['a', 'b', 'c']);
    // The ranked list was rebuilt meanwhile; page 2 still pages the pin
    // its cursor names (18.11).
    expect(
      (await s.postsForPage('v', {}, 'k', 20, { pin: first.pin })).ids,
    ).toEqual(['a', 'b', 'c']);
    expect(postsFor).toHaveBeenCalledTimes(1);
    // A new first page re-pins the fresh list.
    expect((await s.postsForPage('v', {}, 'k', 0)).ids).toEqual([
      'z',
      'a',
      'b',
    ]);
  });

  it('18.11 a newer first page (pull to refresh, the reels’ fresh mix) never moves an older scroll', async () => {
    const redis = makeRedis();
    const s = new RecommendationsService(
      {} as never,
      redis as never,
      settingsOf(true) as never,
    );
    jest
      .spyOn(s, 'postsFor')
      .mockResolvedValueOnce(['a', 'b', 'c'])
      .mockResolvedValueOnce(['z', 'a', 'b']);
    const scroll = await s.postsForPage('v', {}, 'k', 0);
    const fresh = await s.postsForPage('v', {}, 'k', 0);
    expect(fresh.ids).toEqual(['z', 'a', 'b']);
    expect(fresh.pin).not.toBe(scroll.pin);
    // The old scroll's page 2 still reads ITS copy: nothing skipped/repeated.
    const page2 = await s.postsForPage('v', {}, 'k', 20, { pin: scroll.pin });
    expect(page2.ids).toEqual(['a', 'b', 'c']);
    // And the fresh scroll reads its own.
    expect(
      (await s.postsForPage('v', {}, 'k', 20, { pin: fresh.pin })).ids,
    ).toEqual(['z', 'a', 'b']);
  });

  it('a lost pin falls back to the live list (and pins it)', async () => {
    const redis = makeRedis();
    const s = new RecommendationsService(
      {} as never,
      redis as never,
      settingsOf(true) as never,
    );
    jest.spyOn(s, 'postsFor').mockResolvedValue(['x']);
    expect((await s.postsForPage('v', {}, 'k', 20)).ids).toEqual(['x']);
    expect(
      [...redis.store.keys()].some((k) => k.startsWith('reco:posts:pin:v:')),
    ).toBe(true);
  });

  it('switch off → no pin (the old behaviour)', async () => {
    const redis = makeRedis();
    const s = new RecommendationsService(
      {} as never,
      redis as never,
      settingsOf(false) as never,
    );
    const postsFor = jest
      .spyOn(s, 'postsFor')
      .mockResolvedValueOnce(['a'])
      .mockResolvedValueOnce(['b']);
    await s.postsForPage('v', {}, 'k', 0);
    expect((await s.postsForPage('v', {}, 'k', 20)).ids).toEqual(['b']);
    expect(postsFor).toHaveBeenCalledTimes(2);
    expect(redis.store.size).toBe(0);
  });
});
