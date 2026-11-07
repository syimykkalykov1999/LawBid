import { countingPrisma } from '../../prisma/query-counter.test-support';
import { AdminSearchService } from '../admin-search/admin-search.service';
import { PRACTICES_TTL_SEC, SearchService } from './search.service';

/**
 * Data-layer audit 2026-11-04 (R-395): topic type-ahead is reference data,
 * answered from one shared Redis entry per typed prefix; the admin search
 * statistics come from the shared admin summary.
 */
function fakeRedis() {
  const store = new Map<string, string>();
  const ttl = new Map<string, number>();
  return {
    store,
    ttl,
    get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    set: jest.fn((k: string, v: string, ...rest: unknown[]) => {
      if (rest.includes('NX') && store.has(k)) return Promise.resolve(null);
      store.set(k, v);
      const i = rest.indexOf('EX');
      if (i >= 0) ttl.set(k, Number(rest[i + 1]));
      return Promise.resolve('OK');
    }),
    del: jest.fn((k: string) => Promise.resolve(store.delete(k) ? 1 : 0)),
  };
}

function search() {
  const cache = fakeRedis();
  const provider = {
    practiceMatches: jest.fn(() =>
      Promise.resolve([{ code: 'family_law', nameEn: 'Family', hit: null }]),
    ),
  };
  const svc = Object.create(SearchService.prototype) as SearchService;
  Object.assign(svc, {
    provider,
    limits: { consume: jest.fn(() => Promise.resolve()) },
    redis: fakeRedis(),
    cacheRedis: cache,
  });
  return { svc, cache, provider };
}
const user = { sub: 'u1', role: 'client' } as never;

describe('GET /search/practices cache', () => {
  it('the same prefix typed by anyone is computed once', async () => {
    const { svc, cache, provider } = search();
    const a = await svc.practices(user, 'Fami');
    const b = await svc.practices(
      { sub: 'u2', role: 'attorney' } as never,
      ' fami ',
    );
    expect(b).toEqual(a);
    expect(provider.practiceMatches).toHaveBeenCalledTimes(1);
    const key = [...cache.store.keys()].find((k) =>
      k.startsWith('search:practices:v1:'),
    );
    expect(key).toBeDefined();
    const ttl = cache.ttl.get(key as string) ?? 0;
    expect(ttl).toBeGreaterThanOrEqual(PRACTICES_TTL_SEC * 0.8);
    expect(ttl).toBeLessThanOrEqual(PRACTICES_TTL_SEC * 1.2);
  });

  it('another prefix is its own entry; one letter never reaches the cache', async () => {
    const { svc, provider, cache } = search();
    await svc.practices(user, 'fam');
    await svc.practices(user, 'div');
    await expect(svc.practices(user, 'd')).resolves.toEqual([]);
    expect(provider.practiceMatches).toHaveBeenCalledTimes(2);
    expect(cache.get).toHaveBeenCalled();
  });

  it('a dead cache still answers (fail soft)', async () => {
    const { svc, cache, provider } = search();
    cache.get.mockRejectedValue(new Error('down'));
    cache.set.mockRejectedValue(new Error('down'));
    await expect(svc.practices(user, 'fam')).resolves.toHaveLength(1);
    expect(provider.practiceMatches).toHaveBeenCalledTimes(1);
  });
});

describe('Admin search statistics', () => {
  function admin(stored: boolean) {
    const q = countingPrisma();
    const summary = {
      get: jest.fn((key: string, compute: () => Promise<unknown>) =>
        stored
          ? Promise.resolve({ data: { key }, computedAt: '' })
          : compute().then((data) => ({ data, computedAt: '' })),
      ),
    };
    const svc = new AdminSearchService(
      q.prisma as never,
      {} as never,
      summary as never,
    );
    return { svc, q, summary };
  }

  it('overview + top with stored stats cost 0 queries (were 4)', async () => {
    const { svc, q, summary } = admin(true);
    await svc.overview(7);
    await svc.top(7);
    expect(q.count()).toBe(0);
    expect(summary.get.mock.calls.map((c) => c[0])).toEqual([
      'search-overview:7',
      'search-top:7',
    ]);
  });

  it('a cold window is computed once with the same 3 counts', async () => {
    const { svc, q } = admin(false);
    await expect(svc.overview(30)).resolves.toEqual({
      queries: 0,
      noResults: 0,
      clicks: 0,
    });
    expect(q.count()).toBe(3);
  });
});
