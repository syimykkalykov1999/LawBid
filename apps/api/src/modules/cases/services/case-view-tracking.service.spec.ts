import { CaseViewTrackingService } from './case-view-tracking.service';

function fakeRedis() {
  // eslint-disable-next-line prefer-const
  let r: ReturnType<typeof build>;
  const build = () => {
    const sets = new Map<string, Set<string>>();
    const pending = new Map<string, number>();
    return {
      sadd: jest.fn((key: string, member: string) => {
        const set = sets.get(key) ?? new Set<string>();
        const isNew = !set.has(member);
        set.add(member);
        sets.set(key, set);
        return Promise.resolve(isNew ? 1 : 0);
      }),
      hincrby: jest.fn((_key: string, field: string, by: number) => {
        pending.set(field, (pending.get(field) ?? 0) + by);
        return Promise.resolve(pending.get(field));
      }),
      expire: jest.fn<Promise<number>, [string, number]>(() =>
        Promise.resolve(1),
      ),
      multi: jest.fn(() => {
        const ops: (() => unknown)[] = [];
        const tx = {
          expire: (...a: [string, number]) => (
            ops.push(() => r.expire(...a)),
            tx
          ),
          hincrby: (...a: [string, string, number]) => (
            ops.push(() => r.hincrby(...a)),
            tx
          ),
          exec: () => Promise.all(ops.map((op) => op())),
        };
        return tx;
      }),
      // Single-page HSCAN over the pending hash: [cursor, field, value, ...].
      hscan: jest.fn(() =>
        Promise.resolve([
          '0',
          [...pending.entries()].flatMap(([k, v]) => [k, String(v)]),
        ]),
      ),
      // DRAIN_BATCH: HMGET + HDEL of every field passed.
      eval: jest.fn(
        (
          _script: string,
          _numKeys: number,
          _key: string,
          ...fields: string[]
        ) => {
          const vals = fields.map((f) => {
            const v = pending.get(f);
            pending.delete(f);
            return v === undefined ? null : String(v);
          });
          return Promise.resolve(vals);
        },
      ),
      pending,
    };
  };
  r = build();
  return r;
}

function fakeLogger() {
  return { setContext: jest.fn(), error: jest.fn(), info: jest.fn() };
}

describe('CaseViewTrackingService', () => {
  it('records a view once per (attorney, case) pair', async () => {
    const redis = fakeRedis();
    const prisma = { $executeRaw: jest.fn() };
    const service = new CaseViewTrackingService(
      prisma as never,
      redis as never,
      fakeLogger() as never,
    );
    expect(await service.recordView('att-1', 'case-1')).toBe(true);
    expect(await service.recordView('att-1', 'case-1')).toBe(false);
    expect(await service.recordView('att-2', 'case-1')).toBe(true);
    expect(redis.hincrby).toHaveBeenCalledTimes(2);
  });

  it('flushPending drains counts and applies one batched update', async () => {
    const redis = fakeRedis();
    const prisma = { $executeRaw: jest.fn().mockResolvedValue(undefined) };
    const service = new CaseViewTrackingService(
      prisma as never,
      redis as never,
      fakeLogger() as never,
    );
    await service.recordView('att-1', 'case-1');
    await service.recordView('att-2', 'case-1');
    await service.recordView('att-1', 'case-2');

    const result = await service.flushPending();
    expect(result).toEqual({ casesUpdated: 2 });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);

    // Draining again with nothing pending is a no-op.
    expect(await service.flushPending()).toEqual({ casesUpdated: 0 });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('a view recorded after a flush starts a fresh pending delta', async () => {
    const redis = fakeRedis();
    const prisma = { $executeRaw: jest.fn().mockResolvedValue(undefined) };
    const service = new CaseViewTrackingService(
      prisma as never,
      redis as never,
      fakeLogger() as never,
    );
    await service.recordView('att-1', 'case-1');
    await service.flushPending();
    await service.recordView('att-2', 'case-1');
    const result = await service.flushPending();
    expect(result).toEqual({ casesUpdated: 1 });
  });

  it('sets a TTL on the dedup set so Redis memory stays bounded', async () => {
    const redis = fakeRedis();
    const service = new CaseViewTrackingService(
      { $executeRaw: jest.fn() } as never,
      redis as never,
      fakeLogger() as never,
    );
    await service.recordView('att-1', 'case-1');
    expect(redis.expire).toHaveBeenCalledWith('cv:seen:case-1', 60 * 24 * 3600);
  });

  it('puts drained views back when the DB update fails', async () => {
    const redis = fakeRedis();
    const prisma = {
      $executeRaw: jest
        .fn()
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValue(undefined),
    };
    const service = new CaseViewTrackingService(
      prisma as never,
      redis as never,
      fakeLogger() as never,
    );
    await service.recordView('att-1', 'case-1');
    await service.recordView('att-2', 'case-1');
    await expect(service.flushPending()).rejects.toThrow('db down');
    expect(redis.pending.get('case-1')).toBe(2);
    expect(await service.flushPending()).toEqual({ casesUpdated: 1 });
    expect(redis.pending.size).toBe(0);
  });
});
