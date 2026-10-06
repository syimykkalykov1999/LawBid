import { CostAutoscaleService, historyKey } from './cost-autoscale.service';

/**
 * CostAutoscaleService against an in-memory Redis/Prisma fake: history
 * snapshot + trim, auto vs manual windows, write-only-on-change, the
 * once-a-day ceiling alert and the job lock.
 */

const ENV: Record<string, number> = {};
for (const p of ['SMS', 'EMAIL', 'ID_CHECK', 'STORAGE', 'TRANSLATE', 'VIDEO']) {
  ENV[`BUDGET_${p}_PER_MINUTE_MAX`] = 30;
  ENV[`BUDGET_${p}_DAILY_MAX`] = 300;
  ENV[`BUDGET_${p}_MONTHLY_MAX`] = 5000;
}

const NOW = new Date('2026-10-05T13:17:00Z');

function fakeRedis() {
  const kv = new Map<string, string>();
  const hashes = new Map<string, Map<string, string>>();
  const hash = (k: string) => {
    if (!hashes.has(k)) hashes.set(k, new Map());
    return hashes.get(k)!;
  };
  return {
    kv,
    hashes,
    get: jest.fn((k: string) => Promise.resolve(kv.get(k) ?? null)),
    mget: jest.fn((...keys: string[]) =>
      Promise.resolve(keys.map((k) => kv.get(k) ?? null)),
    ),
    set: jest.fn((k: string, v: string, ...args: unknown[]) => {
      if (args.includes('NX') && kv.has(k)) return Promise.resolve(null);
      kv.set(k, v);
      return Promise.resolve('OK');
    }),
    del: jest.fn((k: string) => {
      kv.delete(k);
      return Promise.resolve(1);
    }),
    eval: jest.fn((_s: string, _n: number, k: string) => {
      kv.delete(k);
      return Promise.resolve(1);
    }),
    hset: jest.fn(
      (k: string, a: string | Record<string, string>, b?: string) => {
        const h = hash(k);
        if (typeof a === 'string') h.set(a, b!);
        else for (const [f, v] of Object.entries(a)) h.set(f, v);
        return Promise.resolve(1);
      },
    ),
    hkeys: jest.fn((k: string) => Promise.resolve([...hash(k).keys()])),
    hdel: jest.fn((k: string, ...fields: string[]) => {
      for (const f of fields) hash(k).delete(f);
      return Promise.resolve(fields.length);
    }),
    hgetall: jest.fn((k: string) =>
      Promise.resolve(Object.fromEntries(hash(k))),
    ),
  };
}

function build(appConfig: Record<string, unknown> = {}) {
  const redis = fakeRedis();
  const rows = new Map<string, unknown>(Object.entries(appConfig));
  const prisma = {
    appConfig: {
      upsert: jest.fn(
        (a: { where: { key: string }; update: { value: unknown } }) => {
          rows.set(a.where.key, a.update.value);
          return Promise.resolve({});
        },
      ),
    },
  };
  const config = {
    get: jest.fn(() => 'test'),
    getOrThrow: jest.fn((k: string) => {
      if (!(k in ENV)) throw new Error(`missing ${k}`);
      return ENV[k];
    }),
  };
  const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() };
  const service = new CostAutoscaleService(
    prisma as never,
    redis as never,
    { getConfig: () => Promise.resolve(Object.fromEntries(rows)) } as never,
    config as never,
    logger as never,
  );
  return { service, redis, prisma, rows, logger };
}

describe('CostAutoscaleService', () => {
  it('copies today/yesterday daily counters into the history and trims old days', async () => {
    const { service, redis } = build();
    redis.kv.set('budget:{sms}:d:20261005', '12');
    redis.kv.set('budget:{sms}:d:20261004', '40');
    redis.hashes.set(
      historyKey('sms'),
      new Map([
        ['20260801', '5'],
        ['20261003', '7'],
      ]),
    );
    await service.snapshotHistory('sms', NOW);
    expect(Object.fromEntries(redis.hashes.get(historyKey('sms'))!)).toEqual({
      '20261003': '7',
      '20261004': '40',
      '20261005': '12',
    });
  });

  it('writes caps in auto mode only when they change, and leaves manual caps alone', async () => {
    const { service, redis, prisma, rows } = build({
      'budget.sms.daily_max': 300,
      'budget.sms.monthly_max': 5000,
      'budget.sms.per_minute_max': 30,
      'budget.autoscale': { sms: { monthly: { mode: 'manual' } } },
    });
    redis.kv.set('budget:{sms}:d:20261005', '400');

    const first = await service.run(NOW);
    expect(first?.changes.filter((c) => c.provider === 'sms')).toEqual([
      { provider: 'sms', window: 'daily', from: 300, to: 800, target: 800 },
    ]);
    expect(rows.get('budget.sms.daily_max')).toBe(800);
    expect(rows.get('budget.sms.monthly_max')).toBe(5000);
    // Nothing else had traffic: every other provider is written once at its floor.
    expect(rows.get('budget.email.daily_max')).toBe(300);

    prisma.appConfig.upsert.mockClear();
    const second = await service.run(NOW);
    expect(second?.changes).toEqual([]);
    expect(prisma.appConfig.upsert).not.toHaveBeenCalled();
    expect(await service.lastAutoAt()).toMatchObject({
      sms: NOW.toISOString(),
    });
  });

  it('keeps a switched-off provider (cap 0, no autoscale entry) switched off', async () => {
    const { service, rows } = build({ 'budget.id_check.daily_max': 0 });
    await service.run(NOW);
    expect(rows.get('budget.id_check.daily_max')).toBe(0);
  });

  it('alerts once a day when the ceiling holds a cap down', async () => {
    const { service, redis, logger } = build({
      'budget.autoscale': { sms: { daily: { floor: 300, ceiling: 500 } } },
    });
    redis.kv.set('budget:{sms}:d:20261005', '400');
    await service.run(NOW);
    await service.run(NOW);
    const alerts = logger.warn.mock.calls.filter(
      ([o]) => (o as { alert?: string }).alert === 'cost_budget_ceiling',
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0][0]).toMatchObject({
      provider: 'sms',
      window: 'daily',
      wanted: 800,
      cap: 500,
    });
  });

  it('skips when another instance holds the job lock', async () => {
    const { service, redis } = build();
    redis.kv.set('lock:job:cost.autoscale', 'other');
    await expect(service.run(NOW)).resolves.toBeNull();
  });
});
