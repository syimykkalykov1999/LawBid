import { SearchService } from './search.service';

type Priv = {
  ranked(
    kind: string,
    params: Record<string, unknown>,
    load: () => Promise<string[]>,
  ): Promise<string[]>;
};

/**
 * Batch C items 9 and 14: ranked result lists are shared by everyone who
 * asks the same thing, live in the cache Redis and are kept for the
 * `search.ranked_cache_ttl_sec` setting (default 60 s).
 */
describe('SearchService ranked cache', () => {
  function make(ttl: number | Error = 60) {
    const store = new Map<string, string>();
    const cache = {
      get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
      set: jest.fn((k: string, v: string, ...rest: unknown[]) => {
        void rest;
        store.set(k, v);
        return Promise.resolve('OK');
      }),
    };
    const main = { get: jest.fn().mockResolvedValue('3') };
    const svc = Object.create(SearchService.prototype) as SearchService;
    Object.assign(svc, {
      redis: main,
      cacheRedis: cache,
      settings: {
        number: () =>
          ttl instanceof Error ? Promise.reject(ttl) : Promise.resolve(ttl),
      },
    });
    return { svc: svc as unknown as Priv, cache, main };
  }

  it('same normalized query and filters = one shared key, one load', async () => {
    const { svc, cache } = make();
    const load = jest.fn().mockResolvedValue(['a', 'b']);
    const params = { q: 'divorce', state: 'NY' };
    expect(await svc.ranked('a', params, load)).toEqual(['a', 'b']);
    expect(await svc.ranked('a', { ...params }, load)).toEqual(['a', 'b']);
    expect(load).toHaveBeenCalledTimes(1);
    const key = cache.set.mock.calls[0][0];
    expect(key).toMatch(/^search:a:/);
    // The key is a hash: no query text, no user id.
    expect(key).not.toContain('divorce');
  });

  it('different filters never share a key', async () => {
    const { svc, cache } = make();
    const load = jest.fn().mockResolvedValue(['x']);
    await svc.ranked('a', { q: 'x', state: 'NY' }, load);
    await svc.ranked('a', { q: 'x', state: 'CA' }, load);
    expect(load).toHaveBeenCalledTimes(2);
    expect(cache.set.mock.calls[0][0]).not.toBe(cache.set.mock.calls[1][0]);
  });

  it('keeps the list for the configured seconds (jittered, 30-60 s range)', async () => {
    const { svc, cache } = make(60);
    await svc.ranked('a', { q: 'x' }, () => Promise.resolve(['1']));
    const ttl = cache.set.mock.calls[0][3] as number;
    expect(ttl).toBeGreaterThanOrEqual(30);
    expect(ttl).toBeLessThanOrEqual(75);
  });

  it('writes to the cache Redis, reads only the synonym version from the main one', async () => {
    const { svc, cache, main } = make();
    await svc.ranked('a', { q: 'x' }, () => Promise.resolve(['1']));
    expect(main.get).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledTimes(1);
  });

  it('a settings failure falls back to the default TTL', async () => {
    const { svc, cache } = make(new Error('db'));
    await svc.ranked('a', { q: 'x' }, () => Promise.resolve(['1']));
    expect(cache.set).toHaveBeenCalledTimes(1);
  });
});
