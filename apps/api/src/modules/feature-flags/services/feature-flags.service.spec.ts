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

describe('rollout_percent (owner 2026-10-25)', () => {
  const rows = [
    { key: 'full', enabled: true, rollout_percent: 100 },
    { key: 'off', enabled: false, rollout_percent: 100 },
    { key: 'partial', enabled: true, rollout_percent: 30 },
    { key: 'zero', enabled: true, rollout_percent: 0 },
  ];
  const make = () => {
    const redis = buildFakeRedis(new Map<string, string>());
    const prisma = {
      featureFlag: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    return new FeatureFlagsService(prisma as never, redis as never);
  };

  it('the public view shows a partly rolled-out flag as off', async () => {
    expect(await make().getFlags()).toEqual({
      full: true,
      off: false,
      partial: false,
      zero: false,
    });
  });

  it('a user gets a stable answer for a partial flag; full / off / zero never change', async () => {
    const svc = make();
    const id = '5b7d9c1e-0000-4000-8000-000000000001';
    const a = await svc.getFlagsFor(id);
    const b = await svc.getFlagsFor(id);
    expect(a).toEqual(b);
    expect(a.full).toBe(true);
    expect(a.off).toBe(false);
    expect(a.zero).toBe(false);
    expect(typeof a.partial).toBe('boolean');
  });

  it('about 30% of users get a 30% flag', async () => {
    const svc = make();
    let on = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      if (await svc.isEnabledFor('partial', false, id)) on++;
    }
    expect(on / n).toBeGreaterThan(0.26);
    expect(on / n).toBeLessThan(0.34);
  });

  it('falls back to the default for an unknown flag', async () => {
    expect(await make().isEnabledFor('missing', true, 'u1')).toBe(true);
  });
});
