import { AppConfigService, clearAppConfigMemo } from './app-config.service';

function buildFakeRedis(store: Map<string, string> = new Map()) {
  return {
    get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
  };
}

describe('AppConfigService.getConfig', () => {
  it('reads through to Prisma on a Redis cache miss, returns a flat map, and populates the cache', async () => {
    const redis = buildFakeRedis();
    const findMany = jest.fn().mockResolvedValue([
      { key: 'min_app_version_ios', value: '0.1.0' },
      { key: 'min_app_version_android', value: '0.1.0' },
    ]);
    const prisma = { appConfig: { findMany } };
    const service = new AppConfigService(prisma as never, redis as never);

    const config = await service.getConfig();

    expect(config).toEqual({
      min_app_version_ios: '0.1.0',
      min_app_version_android: '0.1.0',
    });
    expect(redis.set).toHaveBeenCalledWith(
      'config:app_config',
      JSON.stringify(config),
      'EX',
      expect.any(Number),
    );
  });

  it('with Redis away (load test 2026-11-02) reads the table and skips the write-back instead of failing', async () => {
    const redis = {
      get: jest.fn().mockRejectedValue(new Error('Command timed out')),
      set: jest.fn().mockRejectedValue(new Error('Command timed out')),
    };
    const findMany = jest
      .fn()
      .mockResolvedValue([{ key: 'min_app_version_ios', value: '1.2.3' }]);
    const prisma = { appConfig: { findMany } };
    const service = new AppConfigService(prisma as never, redis as never);
    await expect(service.getConfig()).resolves.toEqual({
      min_app_version_ios: '1.2.3',
    });
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledTimes(1);
  });

  it('serves the cached map without hitting Prisma on a cache hit', async () => {
    const store = new Map([
      ['config:app_config', JSON.stringify({ min_app_version_ios: '1.2.0' })],
    ]);
    const redis = buildFakeRedis(store);
    const findMany = jest.fn();
    const prisma = { appConfig: { findMany } };
    const service = new AppConfigService(prisma as never, redis as never);

    expect(await service.getConfig()).toEqual({ min_app_version_ios: '1.2.0' });
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('AppConfigService.getMinAppVersion', () => {
  it('returns the string value for the requested platform', async () => {
    const redis = buildFakeRedis(
      new Map([
        [
          'config:app_config',
          JSON.stringify({
            min_app_version_ios: '1.0.0',
            min_app_version_android: '1.1.0',
          }),
        ],
      ]),
    );
    const prisma = { appConfig: { findMany: jest.fn() } };
    const service = new AppConfigService(prisma as never, redis as never);

    expect(await service.getMinAppVersion('ios')).toBe('1.0.0');
    expect(await service.getMinAppVersion('android')).toBe('1.1.0');
  });

  it('returns undefined instead of throwing when the key is missing or not a string', async () => {
    const redis = buildFakeRedis(
      new Map([['config:app_config', JSON.stringify({})]]),
    );
    const prisma = { appConfig: { findMany: jest.fn() } };
    const service = new AppConfigService(prisma as never, redis as never);

    expect(await service.getMinAppVersion('ios')).toBeUndefined();
  });
});

describe('AppConfigService.getConfig: expired memo (row 69, KE 123)', () => {
  const env = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = env;
    clearAppConfigMemo();
    jest.restoreAllMocks();
  });
  const flush = async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  };

  it('answers the expired value at once and refreshes once in the background', async () => {
    process.env.NODE_ENV = 'production'; // the memo is off under jest
    clearAppConfigMemo();
    let rows = [{ key: 'k', value: 'v1' }];
    let release!: () => void;
    let gate: Promise<void> = Promise.resolve();
    const findMany = jest.fn(async () => {
      await gate;
      return rows;
    });
    const service = new AppConfigService(
      { appConfig: { findMany } } as never,
      buildFakeRedis() as never,
    );
    let now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    expect(await service.getConfig()).toEqual({ k: 'v1' }); // cold: awaited
    expect(findMany).toHaveBeenCalledTimes(1);

    // The memo expires; the table read now hangs (pool busy, Redis miss).
    now += 60_000;
    rows = [{ key: 'k', value: 'v2' }];
    gate = new Promise<void>((r) => (release = r));
    const other = new AppConfigService(
      { appConfig: { findMany } } as never,
      buildFakeRedis() as never,
    );
    // Neither caller waits for the table: both get the expired value.
    expect(await other.getConfig()).toEqual({ k: 'v1' });
    expect(await other.getConfig()).toEqual({ k: 'v1' });
    await flush();
    expect(findMany).toHaveBeenCalledTimes(2); // one background refresh
    expect(await other.getConfig()).toEqual({ k: 'v1' }); // still hanging
    release();
    await flush();
    expect(await other.getConfig()).toEqual({ k: 'v2' });
  });

  it('a refresh started before an admin write never brings the old value back', async () => {
    process.env.NODE_ENV = 'production';
    clearAppConfigMemo();
    let release!: () => void;
    let gate: Promise<void> = Promise.resolve();
    let rows = [{ key: 'k', value: 'old' }];
    const findMany = jest.fn(async () => {
      await gate;
      return rows;
    });
    // dropAppConfigCache also deletes the Redis copy: a Redis that misses.
    const missing = {
      get: jest.fn(() => Promise.resolve(null)),
      set: jest.fn(() => Promise.resolve('OK')),
    };
    const service = new AppConfigService(
      { appConfig: { findMany } } as never,
      missing as never,
    );
    let now = 2_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    await service.getConfig();
    now += 60_000;
    gate = new Promise<void>((r) => (release = r));
    await service.getConfig(); // starts the background refresh ('old')
    clearAppConfigMemo(); // admin write
    rows = [{ key: 'k', value: 'new' }];
    release();
    await flush();
    gate = Promise.resolve();
    expect(await service.getConfig()).toEqual({ k: 'new' });
  });
});
