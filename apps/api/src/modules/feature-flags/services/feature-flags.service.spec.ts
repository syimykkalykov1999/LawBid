import { FeatureFlagsService } from './feature-flags.service';

function buildFakeRedis(store: Map<string, string> = new Map()) {
  return {
    get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
  };
}

describe('FeatureFlagsService.getFlags', () => {
  it('reads through to Prisma on a Redis cache miss, returns a flat map, and populates the cache', async () => {
    const redis = buildFakeRedis();
    const findMany = jest.fn().mockResolvedValue([
      { key: 'apple_login', enabled: true },
      { key: 'video_posts', enabled: false },
    ]);
    const prisma = { featureFlag: { findMany } };
    const service = new FeatureFlagsService(prisma as never, redis as never);

    const flags = await service.getFlags();

    expect(flags).toEqual({ apple_login: true, video_posts: false });
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      'config:feature_flags',
      JSON.stringify({ apple_login: true, video_posts: false }),
      'EX',
      expect.any(Number),
    );
  });

  it('serves the cached map without hitting Prisma on a cache hit', async () => {
    const store = new Map([
      ['config:feature_flags', JSON.stringify({ google_login: true })],
    ]);
    const redis = buildFakeRedis(store);
    const findMany = jest.fn();
    const prisma = { featureFlag: { findMany } };
    const service = new FeatureFlagsService(prisma as never, redis as never);

    expect(await service.getFlags()).toEqual({ google_login: true });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('returns an empty map when the table is empty rather than throwing', async () => {
    const redis = buildFakeRedis();
    const prisma = {
      featureFlag: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new FeatureFlagsService(prisma as never, redis as never);

    expect(await service.getFlags()).toEqual({});
  });
});
