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
