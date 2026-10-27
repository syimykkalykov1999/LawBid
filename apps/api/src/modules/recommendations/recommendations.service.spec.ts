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
});
