import { CaseViewTrackingService } from './case-view-tracking.service';

/** Minimal in-memory Redis for the service's Lua scripts and lock. */
function fakeRedis() {
  const sets = new Map<string, Set<string>>();
  const ttl = new Map<string, number>();
  const pending = new Map<string, number>();
  const strings = new Map<string, string>();
  const hincrby = (field: string, by: number) =>
    pending.set(field, (pending.get(field) ?? 0) + by);
  const redis = {
    pending,
    ttl,
    eval: jest.fn(
      (script: string, _n: number, ...args: (string | number)[]) => {
        if (script.includes('SADD')) {
          const [seenKey, , attorneyId, seconds, caseId] = args as string[];
          const set = sets.get(seenKey) ?? new Set<string>();
          if (set.has(attorneyId)) return Promise.resolve(0);
          set.add(attorneyId);
          sets.set(seenKey, set);
          ttl.set(seenKey, Number(seconds));
          hincrby(caseId, 1);
          return Promise.resolve(1);
        }
        if (script.includes('HMGET')) {
          const fields = args.slice(1) as string[];
          return Promise.resolve(
            fields.map((f) => {
              const v = pending.get(f);
              pending.delete(f);
              return v === undefined ? null : String(v);
            }),
          );
        }
        // job-lock release: compare-and-delete
        const [key, token] = args as string[];
        if (strings.get(key) === token) strings.delete(key);
        return Promise.resolve(1);
      },
    ),
    set: jest.fn((key: string, value: string) => {
      if (strings.has(key)) return Promise.resolve(null);
      strings.set(key, value);
      return Promise.resolve('OK');
    }),
    hscan: jest.fn(() =>
      Promise.resolve([
        '0',
        [...pending.entries()].flatMap(([k, v]) => [k, String(v)]),
      ]),
    ),
    multi: jest.fn(() => {
      const ops: (() => void)[] = [];
      const tx = {
        hincrby: (_k: string, f: string, by: number) => {
          ops.push(() => hincrby(f, by));
          return tx;
        },
        exec: () => Promise.resolve(ops.forEach((op) => op())),
      };
      return tx;
    }),
  };
  return redis;
}

function fakeLogger() {
  return { setContext: jest.fn(), error: jest.fn(), info: jest.fn() };
}

function service(prisma: object, redis = fakeRedis()) {
  return {
    redis,
    svc: new CaseViewTrackingService(
      prisma as never,
      redis as never,
      fakeLogger() as never,
    ),
  };
}

describe('CaseViewTrackingService', () => {
  it('records a view once per (attorney, case) pair, atomically with a TTL', async () => {
    const { svc, redis } = service({ $executeRaw: jest.fn() });
    expect(await svc.recordView('att-1', 'case-1')).toBe(true);
    expect(await svc.recordView('att-1', 'case-1')).toBe(false);
    expect(await svc.recordView('att-2', 'case-1')).toBe(true);
    expect(redis.pending.get('case-1')).toBe(2);
    expect(redis.ttl.get('cv:seen:case-1')).toBe(60 * 24 * 3600);
  });

  it('flushPending drains counts and applies one batched update', async () => {
    const prisma = { $executeRaw: jest.fn().mockResolvedValue(undefined) };
    const { svc } = service(prisma);
    await svc.recordView('att-1', 'case-1');
    await svc.recordView('att-2', 'case-1');
    await svc.recordView('att-1', 'case-2');
    expect(await svc.flushPending()).toEqual({ casesUpdated: 2 });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(await svc.flushPending()).toEqual({ casesUpdated: 0 });
  });

  it('a held flush lock skips the run (one flusher across pods)', async () => {
    const prisma = { $executeRaw: jest.fn().mockResolvedValue(undefined) };
    const redis = fakeRedis();
    await redis.set('lock:job:cases.view-flush', 'other-pod');
    const { svc } = service(prisma, redis);
    await svc.recordView('att-1', 'case-1');
    expect(await svc.flushPending()).toEqual({ casesUpdated: 0 });
    expect(redis.pending.get('case-1')).toBe(1);
  });

  it('puts drained views back when the DB update fails', async () => {
    const prisma = {
      $executeRaw: jest
        .fn()
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValue(undefined),
    };
    const { svc, redis } = service(prisma);
    await svc.recordView('att-1', 'case-1');
    await svc.recordView('att-2', 'case-1');
    await expect(svc.flushPending()).rejects.toThrow('db down');
    expect(redis.pending.get('case-1')).toBe(2);
    expect(await svc.flushPending()).toEqual({ casesUpdated: 1 });
    expect(redis.pending.size).toBe(0);
  });
});
