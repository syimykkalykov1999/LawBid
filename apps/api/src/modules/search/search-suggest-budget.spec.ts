import { SearchService } from './search.service';

/** S7-2: type-ahead endpoints draw on their own budget, not the strict
 * full-search one. */
describe('SearchService type-ahead budget', () => {
  function make() {
    const limits = { consume: jest.fn().mockResolvedValue(undefined) };
    const store = new Map<string, string>();
    const cache = {
      get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
      set: jest.fn((k: string, v: string) => {
        store.set(k, v);
        return Promise.resolve('OK');
      }),
    };
    const provider = {
      suggest: jest.fn().mockResolvedValue([]),
      practiceMatches: jest.fn().mockResolvedValue([]),
      searchTags: jest.fn().mockResolvedValue([]),
    };
    const svc = Object.create(SearchService.prototype) as Record<
      string,
      unknown
    >;
    Object.assign(svc, { limits, provider, redis: cache, cacheRedis: cache });
    return { svc: svc as unknown as SearchService, limits };
  }
  const user = { sub: 'u1', role: 'client' } as never;

  it('suggest, practices and tags use search_suggest', async () => {
    const { svc, limits } = make();
    await svc.suggest(user, 'imm');
    await svc.practices(user, 'imm');
    await svc.tags(user, 'imm');
    expect(limits.consume.mock.calls.map((c: unknown[]) => c[0])).toEqual([
      'search_suggest',
      'search_suggest',
      'search_suggest',
    ]);
  });

  it('tags: the second identical prefix is answered from the cache', async () => {
    const { svc } = make();
    await svc.tags(user, 'visa');
    await svc.tags(user, 'visa');
    const provider = (svc as unknown as { provider: { searchTags: jest.Mock } })
      .provider;
    expect(provider.searchTags).toHaveBeenCalledTimes(1);
  });
});
