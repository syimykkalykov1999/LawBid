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

describe('payments_in_app is locked off (owner 2026-10-16)', () => {
  const { lockFlags } = jest.requireActual<
    typeof import('../../../common/feature-flags/locked-flags')
  >('../../../common/feature-flags/locked-flags');

  afterEach(() => {
    delete process.env.CASE_PAYMENTS_UNLOCKED_FOR_TESTS;
  });

  it('reads as off whatever the table says', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(lockFlags({ payments_in_app: true, bid_packs: true })).toEqual({
        payments_in_app: false,
        bid_packs: true,
      });
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('only a test environment can unlock it', () => {
    process.env.CASE_PAYMENTS_UNLOCKED_FOR_TESTS = '1';
    expect(lockFlags({ payments_in_app: true }).payments_in_app).toBe(true);
  });
});
