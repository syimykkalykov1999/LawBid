import { AdminSummaryService } from '../../common/admin-summary/admin-summary.service';
import {
  ADMIN_OVERVIEW_KEY,
  AdminOverviewService,
  hourFloor,
} from './admin-overview.service';

/** In-memory stand-in for the ioredis calls AdminSummaryService makes. */
function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    set: jest.fn((k: string, v: string, ...args: unknown[]) => {
      if (args.includes('NX') && store.has(k)) return Promise.resolve(null);
      store.set(k, v);
      return Promise.resolve('OK');
    }),
    del: jest.fn((k: string) => Promise.resolve(store.delete(k) ? 1 : 0)),
    exists: jest.fn((k: string) => Promise.resolve(store.has(k) ? 1 : 0)),
  };
}

/** A Prisma stand-in answering every count of the overview with [n] and
 * the trigger-kept counters (stat_counters, row 78) with [n] too. */
function fakePrisma(n: number) {
  const count = jest.fn(() => Promise.resolve(n));
  const queryRaw = jest.fn(() =>
    Promise.resolve([
      { metric: 'users.live.client', n: BigInt(n) },
      { metric: 'users.live.attorney', n: BigInt(n) },
      { metric: 'messages', n: BigInt(n) },
    ]),
  );
  const model = {
    count,
    aggregate: jest.fn(() =>
      Promise.resolve({ _sum: { assistant_seats: 0, amount_cents: 0 } }),
    ),
    findMany: jest.fn(() => Promise.resolve([])),
  };
  const prisma = new Proxy<Record<string | symbol, unknown>>(
    {},
    {
      get: (_t, prop) =>
        prop === '$queryRaw'
          ? queryRaw
          : typeof prop === 'symbol'
            ? undefined
            : model,
    },
  );
  return { prisma, count, queryRaw };
}

const stored = (redis: ReturnType<typeof fakeRedis>, ageMs: number) =>
  redis.store.set(
    `adm:sum:${ADMIN_OVERVIEW_KEY}`,
    JSON.stringify({
      data: { clients: 7 },
      computedAt: new Date(Date.now() - ageMs).toISOString(),
    }),
  );

describe('AdminOverviewService (row 78: the overview is a daily snapshot)', () => {
  it('a stored copy of any age is answered without a single count', async () => {
    const redis = fakeRedis();
    stored(redis, 30 * 3600_000);
    const { prisma, count } = fakePrisma(1);
    const svc = new AdminOverviewService(
      prisma as never,
      undefined,
      new AdminSummaryService(redis as never),
    );
    expect(await svc.overview()).toEqual({ clients: 7 });
    expect(count).not.toHaveBeenCalled();
  });

  it('nothing stored: concurrent first readers share ONE count', async () => {
    const redis = fakeRedis();
    const { prisma, count, queryRaw } = fakePrisma(3);
    const svc = new AdminOverviewService(
      prisma as never,
      undefined,
      new AdminSummaryService(redis as never),
    );
    const all = await Promise.all([svc.overview(), svc.overview()]);
    expect(all[0].clients).toBe(3);
    expect(all[1].clients).toBe(3);
    expect(all[0].messages7d).toBe(3);
    // One computation: 12 counts + one read of the counters (17 numbers:
    // 2 aggregates, clients / attorneys / messages from stat_counters).
    expect(count).toHaveBeenCalledTimes(12);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('the daily job recounts only when the snapshot is due', async () => {
    const redis = fakeRedis();
    stored(redis, 3600_000);
    const { prisma, count } = fakePrisma(2);
    const svc = new AdminOverviewService(
      prisma as never,
      undefined,
      new AdminSummaryService(redis as never),
    );
    await svc.refreshDaily();
    expect(count).not.toHaveBeenCalled();
    stored(redis, 27 * 3600_000);
    await svc.refreshDaily();
    expect(count).toHaveBeenCalledTimes(12);
    expect((await svc.overview()).clients).toBe(2);
  });
});

describe('hourFloor (row 78: the counters are kept per UTC hour)', () => {
  it('drops minutes, seconds and milliseconds in UTC', () => {
    expect(hourFloor(new Date('2026-11-06T04:37:12.345Z')).toISOString()).toBe(
      '2026-11-06T04:00:00.000Z',
    );
    expect(hourFloor(new Date('2026-11-06T04:00:00.000Z')).toISOString()).toBe(
      '2026-11-06T04:00:00.000Z',
    );
  });
});
