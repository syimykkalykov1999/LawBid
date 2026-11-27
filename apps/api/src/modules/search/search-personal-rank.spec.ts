import { SearchService } from './search.service';

/**
 * Owner 26.11 («поиск умный как ленты?»): posts-by-text and the attorney's
 * cases search keep the text-relevance order first and, like People,
 * re-order only close neighbours (chunks of 5, never across a page) by the
 * viewer's own feed ranking. Which results match never changes.
 */
describe('Search: personal order inside the relevance order', () => {
  // 25 results in relevance order: r00 … r24.
  const shared = Array.from(
    { length: 25 },
    (_, i) => `r${String(i).padStart(2, '0')}`,
  );
  // Viewer A likes the later item of every chunk, viewer B the earlier one.
  const scoreA = new Map(shared.map((id, i) => [id, i]));
  const scoreB = new Map(shared.map((id, i) => [id, -i]));

  function make() {
    const store = new Map<string, string>();
    const cache = {
      get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
      set: jest.fn((k: string, v: string) => {
        store.set(k, v);
        return Promise.resolve('OK');
      }),
    };
    const provider = {
      searchPosts: jest.fn().mockResolvedValue(shared),
      searchCasesRanked: jest.fn().mockResolvedValue(shared),
    };
    const byViewer = (id: string) => (id === 'A' ? scoreA : scoreB);
    const recommendations = {
      postsAffinity: jest.fn((viewer: string) =>
        Promise.resolve(byViewer(viewer)),
      ),
      casesAffinity: jest.fn((viewer: string) =>
        Promise.resolve(byViewer(viewer)),
      ),
    };
    const svc = Object.create(SearchService.prototype) as Record<
      string,
      unknown
    >;
    Object.assign(svc, {
      limits: { consume: jest.fn().mockResolvedValue(undefined) },
      provider,
      redis: cache,
      cacheRedis: cache,
      recommendations,
      // Presentation is not under test: ids straight through.
      presentPosts: (ids: string[]) =>
        Promise.resolve(ids.map((id) => ({ id }))),
      casesFeed: {
        isVerifiedAttorney: jest.fn().mockResolvedValue(true),
        hydrate: (ids: string[]) => Promise.resolve(ids.map((id) => ({ id }))),
      },
      access: {
        visibleCaseIds: (_u: string, ids: string[]) =>
          Promise.resolve(new Set(ids)),
      },
    });
    return {
      svc: svc as unknown as SearchService,
      provider,
      recommendations,
      cache,
    };
  }

  const viewer = (sub: string, over: Record<string, unknown> = {}) =>
    ({ sub, role: 'attorney', ...over }) as never;
  const ids = (page: { items: unknown[] }) =>
    page.items.map((i) => (i as { id: string }).id);

  async function allPosts(svc: SearchService, sub: string, sort?: string) {
    const out: string[][] = [];
    let cursor: string | undefined;
    do {
      const page = await svc.postsByText(viewer(sub), 'divorce', cursor, {
        q: 'divorce',
        sort,
      } as never);
      out.push(ids(page));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return out;
  }

  async function allCases(svc: SearchService, sub: string) {
    const out: string[][] = [];
    let cursor: string | undefined;
    do {
      const page = await svc.cases(viewer(sub), {
        q: 'divorce',
        cursor,
      });
      out.push(ids(page));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return out;
  }

  it('posts: the order changes by viewer, the match set and every page set do not', async () => {
    const { svc, provider } = make();
    const a = await allPosts(svc, 'A');
    const b = await allPosts(svc, 'B');
    expect(a.flat()).not.toEqual(b.flat());
    expect(a.flat()).not.toEqual(shared);
    // Same results, no duplicates, none lost.
    expect([...a.flat()].sort()).toEqual(shared);
    expect([...b.flat()].sort()).toEqual(shared);
    // Every page holds the same ids as the shared page (cursor-safe).
    expect(a.map((p) => [...p].sort())).toEqual([
      shared.slice(0, 20),
      shared.slice(20),
    ]);
    expect(b.map((p) => [...p].sort())).toEqual(a.map((p) => [...p].sort()));
    // Within a chunk of 5 only: A reverses each chunk, B keeps relevance.
    expect(a[0].slice(0, 5)).toEqual(['r04', 'r03', 'r02', 'r01', 'r00']);
    expect(b.flat()).toEqual(shared);
    // The text search ran once: the shared list is viewer-agnostic.
    expect(provider.searchPosts).toHaveBeenCalledTimes(1);
  });

  it('cases: the attorney’s own feed ranking orders neighbours, never the match set', async () => {
    const { svc, provider, recommendations } = make();
    const a = await allCases(svc, 'A');
    const b = await allCases(svc, 'B');
    expect(a.flat()).not.toEqual(b.flat());
    expect([...a.flat()].sort()).toEqual(shared);
    expect(b.map((p) => [...p].sort())).toEqual(a.map((p) => [...p].sort()));
    expect(a[1]).toEqual(['r24', 'r23', 'r22', 'r21', 'r20']);
    expect(recommendations.casesAffinity).toHaveBeenCalledWith('A', shared);
    // Shared per attorney (access rules): one text search each.
    expect(provider.searchCasesRanked).toHaveBeenCalledTimes(2);
  });

  it('the personal copy is kept per viewer: next pages are one cache read', async () => {
    const { svc, recommendations, cache } = make();
    await allPosts(svc, 'A');
    await allPosts(svc, 'B');
    // Scored once per viewer, not per page.
    expect(recommendations.postsAffinity).toHaveBeenCalledTimes(2);
    const keys = cache.set.mock.calls.map((c) => c[0]);
    const personal = keys.filter((k) => k.startsWith('search:p-me:'));
    expect(new Set(personal).size).toBe(2);
    // Keys are hashes: neither the query nor the viewer id is readable.
    for (const k of keys) {
      expect(k).not.toContain('divorce');
      expect(k).not.toMatch(/:A$|:B$/);
    }
  });

  it('"newest" / "popular" keep the viewer’s explicit order', async () => {
    const { svc, recommendations } = make();
    for (const sort of ['newest', 'popular']) {
      expect((await allPosts(svc, 'A', sort)).flat()).toEqual(shared);
    }
    expect(recommendations.postsAffinity).not.toHaveBeenCalled();
  });

  it('a guest gets the shared order and no scoring', async () => {
    const { svc, recommendations } = make();
    const page = await svc.postsByText(
      viewer('guest', { guest: true }),
      'divorce',
    );
    expect(ids(page)).toEqual(shared.slice(0, 20));
    expect(recommendations.postsAffinity).not.toHaveBeenCalled();
  });

  it('scoring failure: the text order (ranking is a bonus)', async () => {
    const { svc, recommendations } = make();
    recommendations.postsAffinity.mockRejectedValue(new Error('db'));
    recommendations.casesAffinity.mockRejectedValue(new Error('db'));
    expect((await allPosts(svc, 'A')).flat()).toEqual(shared);
    expect((await allCases(svc, 'A')).flat()).toEqual(shared);
  });
});
