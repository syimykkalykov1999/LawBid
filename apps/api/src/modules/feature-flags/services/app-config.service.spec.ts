import {
  AppConfigService,
  clearAppConfigMemo,
  dropAppConfigCache,
} from './app-config.service';

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

  it('KNOWN_ERRORS 239: a cold read started before an admin write never keeps the old map as the memo', async () => {
    process.env.NODE_ENV = 'production';
    clearAppConfigMemo();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let rows = [{ key: 'moderation.auto_hide_mode', value: 'weighted' }];
    const findMany = jest.fn(async () => {
      const seen = rows; // the table as this read saw it
      await gate;
      return seen;
    });
    const service = new AppConfigService(
      { appConfig: { findMany } } as never,
      { get: jest.fn(() => Promise.resolve(null)), set: jest.fn() } as never,
    );
    // Boot: a cold read starts (no memo yet) and is slow.
    const cold = service.getConfig();
    await flush();
    // The admin saves meanwhile (stage-6-4 beforeAll: 'count').
    rows = [{ key: 'moderation.auto_hide_mode', value: 'count' }];
    clearAppConfigMemo();
    release();
    await cold; // the old map, answered to the read that asked for it
    // Every later read sees the save, not the boot read's map.
    expect(await service.getConfig()).toEqual({
      'moderation.auto_hide_mode': 'count',
    });
  });

  it('verify batch 11 (C2): a memo older than 2 minutes is not served; the read waits for the table', async () => {
    process.env.NODE_ENV = 'production';
    clearAppConfigMemo();
    let rows = [{ key: 'billing.dispute_auto_cancel', value: true }];
    const findMany = jest.fn(() => Promise.resolve(rows));
    const service = new AppConfigService(
      { appConfig: { findMany } } as never,
      { get: jest.fn(() => Promise.resolve(null)), set: jest.fn() } as never,
    );
    let now = 3_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    await service.getConfig();
    // An hourly job on an idle worker: the owner switched it off at 10:00.
    now += 60 * 60_000;
    rows = [{ key: 'billing.dispute_auto_cancel', value: false }];
    expect(await service.getConfig()).toEqual({
      'billing.dispute_auto_cancel': false,
    });
  });
});

describe('verify batch 11 (C9): dropAppConfigCache after a committed save', () => {
  it('a Redis outage does not turn the saved change into a 500', async () => {
    const down = {
      del: jest.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
      incr: jest.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    };
    await expect(dropAppConfigCache(down as never)).resolves.toBeUndefined();
  });
});

describe('KNOWN_ERRORS 227: a fill that began before a save never writes the old map back', () => {
  function versionedRedis(store: Map<string, string>) {
    return {
      get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
      set: jest.fn((k: string, v: string) => {
        store.set(k, v);
        return Promise.resolve('OK');
      }),
      del: jest.fn((k: string) => {
        store.delete(k);
        return Promise.resolve(1);
      }),
      incr: jest.fn((k: string) => {
        const n = Number(store.get(k) ?? '0') + 1;
        store.set(k, String(n));
        return Promise.resolve(n);
      }),
    };
  }

  it('the save lands while the table read is out: the old map is not left in Redis', async () => {
    const store = new Map<string, string>();
    const redis = versionedRedis(store);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const findMany = jest.fn(async () => {
      await gate;
      // The rows as they were when the read started (before the save).
      return [{ key: 'budget.id_check.daily_max', value: 100 }];
    });
    const service = new AppConfigService(
      { appConfig: { findMany } } as never,
      redis as never,
    );
    const reading = service.getConfig();
    await new Promise((r) => setImmediate(r));
    // The admin's save commits and drops the copy (del + version bump).
    await dropAppConfigCache(redis as never);
    release();
    await reading;
    // The next reader must go to the table, not to the pre-save map.
    expect(store.has('config:app_config')).toBe(false);
  });

  it('no save during the read: the map is cached as before', async () => {
    const store = new Map<string, string>();
    const redis = versionedRedis(store);
    const findMany = jest
      .fn()
      .mockResolvedValue([{ key: 'budget.id_check.daily_max', value: 5 }]);
    const service = new AppConfigService(
      { appConfig: { findMany } } as never,
      redis as never,
    );
    await service.getConfig();
    expect(JSON.parse(store.get('config:app_config') ?? '{}')).toEqual({
      'budget.id_check.daily_max': 5,
    });
  });
});

describe('verify batch 11 (C3): a fresh read never takes the Redis copy', () => {
  it('getConfig(true) reads the table even when Redis holds a copy', async () => {
    // A slow fill on another instance wrote the pre-save map back to Redis
    // after the admin's save dropped it and bumped the version.
    const store = new Map([
      [
        'config:app_config',
        JSON.stringify({ 'security.turnstile.mode': 'off' }),
      ],
    ]);
    const findMany = jest
      .fn()
      .mockResolvedValue([
        { key: 'security.turnstile.mode', value: 'enforce' },
      ]);
    const service = new AppConfigService(
      { appConfig: { findMany } } as never,
      buildFakeRedis(store) as never,
    );
    expect(await service.getConfig(true)).toEqual({
      'security.turnstile.mode': 'enforce',
    });
  });
});
