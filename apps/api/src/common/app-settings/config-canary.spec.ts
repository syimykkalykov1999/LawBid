import { AppConfigService } from '../../modules/feature-flags/services/app-config.service';
import { setCanaryProcess } from './canary-state';
import { ConfigCanaryCohortService } from './config-canary';
import { ROLLOUTS_KEY } from './config-rollout';

/** Б3 (25.11): who reads the new value of a change under watch. */
describe('canary view of app_config', () => {
  const now = Date.now();
  const rollout = {
    id: 'r1',
    adminId: 'a1',
    action: 'config.app_config',
    keys: ['feed.reco_scan_max'],
    before: { 'feed.reco_scan_max': 600 },
    after: { 'feed.reco_scan_max': 900 },
    startedAt: new Date(now).toISOString(),
    watchUntil: new Date(now + 5 * 60_000).toISOString(),
    percent: 10,
  };

  function service(): AppConfigService {
    const prisma = {
      appConfig: {
        findMany: jest.fn().mockResolvedValue([
          { key: 'feed.reco_scan_max', value: 900 },
          { key: ROLLOUTS_KEY, value: [rollout] },
        ]),
      },
    };
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    return new AppConfigService(prisma as never, redis as never);
  }

  afterEach(() => setCanaryProcess(false));

  it('a non-canary process (other API tasks, workers) reads the old value', async () => {
    setCanaryProcess(false);
    const c = await service().getConfig();
    expect(c['feed.reco_scan_max']).toBe(600);
    expect(ROLLOUTS_KEY in c).toBe(false);
  });

  it('a canary API task reads the new value', async () => {
    setCanaryProcess(true);
    const c = await service().getConfig();
    expect(c['feed.reco_scan_max']).toBe(900);
    expect(ROLLOUTS_KEY in c).toBe(false);
  });

  it('the app start answer (fresh, shared by all tasks) gets the old value even on a canary', async () => {
    setCanaryProcess(true);
    expect((await service().getConfig(true))['feed.reco_scan_max']).toBe(600);
  });

  it('heartbeat: with two live API tasks and 10 % exactly one is canary', async () => {
    const members = new Map<string, number>();
    const redis = {
      zadd: jest.fn((_k: string, score: number, id: string) => {
        members.set(id, score);
        return Promise.resolve(1);
      }),
      zremrangebyscore: jest.fn(),
      zrange: jest.fn(() => Promise.resolve([...members.keys()])),
    };
    const appConfig = { getConfig: jest.fn().mockResolvedValue({}) };
    const a = new ConfigCanaryCohortService(redis as never, appConfig as never);
    const b = new ConfigCanaryCohortService(redis as never, appConfig as never);
    await a.beat();
    await b.beat();
    const results = [await a.beat(), await b.beat()];
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('Redis away = not canary (old values)', async () => {
    const redis = { zadd: jest.fn().mockRejectedValue(new Error('down')) };
    const s = new ConfigCanaryCohortService(
      redis as never,
      { getConfig: jest.fn() } as never,
    );
    expect(await s.beat()).toBe(false);
  });
});

/** Review of #1332: the heartbeat belongs to the HTTP API process only. */
describe('canary heartbeat start', () => {
  const { readFileSync, readdirSync } =
    jest.requireActual<typeof import('node:fs')>('node:fs');
  const { join } = jest.requireActual<typeof import('node:path')>('node:path');
  const src = join(__dirname, '..', '..');

  it('building the module never starts it (CLI scripts, workers, tests)', () => {
    const svc = new ConfigCanaryCohortService({} as never, {} as never);
    expect(
      (svc as unknown as { onModuleInit?: unknown }).onModuleInit,
    ).toBeUndefined();
    expect(svc.started).toBe(false);
  });

  it('main.ts starts it right after app.listen; no CLI script does', () => {
    const main = readFileSync(join(src, 'main.ts'), 'utf8');
    const listen = main.indexOf('await app.listen(');
    const start = main.indexOf(
      'ConfigCanaryCohortService, { strict: false }).start()',
    );
    expect(listen).toBeGreaterThan(0);
    expect(start).toBeGreaterThan(listen);
    for (const f of readdirSync(join(src, 'cli'))) {
      if (!f.endsWith('.ts')) continue;
      expect(readFileSync(join(src, 'cli', f), 'utf8')).not.toMatch(
        /ConfigCanaryCohortService/,
      );
    }
  });

  it('start() is idempotent and onModuleDestroy leaves the set', async () => {
    const redis = {
      zadd: jest.fn().mockResolvedValue(1),
      zremrangebyscore: jest.fn().mockResolvedValue(0),
      zrange: jest.fn().mockResolvedValue([]),
      zrem: jest.fn().mockResolvedValue(1),
    };
    const appConfig = { getConfig: jest.fn().mockResolvedValue({}) };
    const svc = new ConfigCanaryCohortService(
      redis as never,
      appConfig as never,
    );
    svc.start();
    svc.start();
    await Promise.resolve();
    expect(redis.zadd).toHaveBeenCalledTimes(1);
    await svc.onModuleDestroy();
    expect(redis.zrem).toHaveBeenCalledTimes(1);
    expect(svc.started).toBe(false);
  });
});

/** Review of #1332: an expired hold drops the config caches once. */
describe('expired hold', () => {
  it('the first read that sees it calls dropAppConfigCache once', async () => {
    const old = Date.now() - 60 * 60_000;
    const rollout = {
      id: 'expired-1',
      adminId: 'a1',
      action: 'config.app_config',
      keys: ['feed.reco_scan_max'],
      before: { 'feed.reco_scan_max': 600 },
      after: { 'feed.reco_scan_max': 900 },
      startedAt: new Date(old).toISOString(),
      watchUntil: new Date(old + 5 * 60_000).toISOString(),
      percent: 10,
    };
    const prisma = {
      appConfig: {
        findMany: jest.fn().mockResolvedValue([
          { key: 'feed.reco_scan_max', value: 900 },
          { key: ROLLOUTS_KEY, value: [rollout] },
        ]),
      },
    };
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      incr: jest.fn().mockResolvedValue(2),
    };
    const svc = new AppConfigService(prisma as never, redis as never);
    const c = await svc.getConfig(true);
    // The hold is over: everyone reads the new value…
    expect(c['feed.reco_scan_max']).toBe(900);
    await new Promise((r) => setImmediate(r));
    // …and the cached copies (bootstrap answer, Redis map) were dropped.
    expect(redis.del).toHaveBeenCalled();
    const calls = redis.del.mock.calls.length;
    await svc.getConfig(true);
    await new Promise((r) => setImmediate(r));
    expect(redis.del.mock.calls.length).toBe(calls);
  });
});
