import type { ConfigService } from '@nestjs/config';
import { SystemHealthService } from './system-health.service';

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation((name: string) => ({
    name,
    getJobCounts: jest.fn(() =>
      Promise.resolve({
        waiting: name === 'stripe-webhooks-dlq' ? 2 : 0,
        failed: 0,
      }),
    ),
    getWaiting: jest.fn(() => Promise.resolve([])),
    isPaused: jest.fn(() => Promise.resolve(false)),
    close: jest.fn(),
  })),
}));

function build(
  over: {
    dbFails?: boolean;
    heartbeatAgoSec?: number | null;
    cipher?: { enabled: boolean; activeKid: string | null; kids: string[] };
    reencryptState?: Record<string, unknown> | null;
    s3Bucket?: string;
    r2Bucket?: string | null;
    r2Fallback?: string;
    head?: (bucket: string) => Promise<unknown>;
    bloatOver?: string[];
    /** R-370: the status-board extra probes (absent = none). */
    probes?: { extra: () => Promise<unknown[]> };
  } = {},
) {
  const opts = over;
  const now = new Date('2026-10-05T12:00:00Z');
  const prisma = {
    $queryRaw: jest.fn(() =>
      over.dbFails ? Promise.reject(new Error('down')) : Promise.resolve([1]),
    ),
  };
  const redis = {
    ping: jest.fn(() => Promise.resolve('PONG')),
    info: jest.fn(() =>
      Promise.resolve('used_memory:1048576\r\nmaxmemory:10485760\r\n'),
    ),
  };
  const config = {
    get: (k: string) =>
      ({ REDIS_URL: 'redis://x', S3_BUCKET_MEDIA: over.s3Bucket })[k],
    getOrThrow: () => 'redis://x',
  } as unknown as ConfigService;
  const hb = over.heartbeatAgoSec === undefined ? 10 : over.heartbeatAgoSec;
  const state = {
    workerHeartbeat: jest.fn(() =>
      Promise.resolve(
        hb === null
          ? null
          : {
              at: new Date(now.getTime() - hb * 1000).toISOString(),
              mode: 'worker',
            },
      ),
    ),
    heavyPause: jest.fn(() => Promise.resolve(null)),
    scaleMode: jest.fn(() => Promise.resolve(null)),
    lastBackup: jest.fn(() => Promise.resolve(null)),
    cost: jest.fn(() => Promise.resolve(null)),
    setCost: jest.fn(),
    bloat: jest.fn(() =>
      Promise.resolve(
        over.bloatOver
          ? {
              at: 'x',
              source: 'pgstattuple',
              warnPercent: 30,
              tables: [],
              over: over.bloatOver,
            }
          : null,
      ),
    ),
  };
  const aws = { available: false, budgetAvailable: false, cost: jest.fn() };
  const settings = {
    boolean: jest.fn(() => Promise.resolve(true)),
    number: jest.fn((k: string) =>
      Promise.resolve(k === 'ops.db_slow_ms' ? 800 : 26),
    ),
  };
  const secrets = { get: jest.fn(() => Promise.resolve(null)) };
  const flags = { isEnabled: jest.fn(() => Promise.resolve(false)) };
  const storage = {
    head: jest.fn((bucket: string) =>
      over.head ? over.head(bucket) : Promise.resolve(null),
    ),
    bucket: jest.fn(() => 'media'),
    publicStoreBucket: jest.fn(() => Promise.resolve(over.r2Bucket ?? null)),
    r2Status: jest.fn(() =>
      Promise.resolve({
        selected: !!over.r2Fallback,
        active: false,
        fallback: over.r2Fallback ?? null,
      }),
    ),
  };
  const cipher = opts.cipher ?? { enabled: false, activeKid: null, kids: [] };
  const reencrypt = {
    state: jest.fn(() => Promise.resolve(opts.reencryptState ?? null)),
    fingerprint: jest.fn(() => 'fp1'),
  };
  const svc = new SystemHealthService(
    prisma as never,
    redis as never,
    config,
    state as never,
    aws as never,
    settings as never,
    secrets as never,
    flags as never,
    storage as never,
    cipher as never,
    reencrypt as never,
    over.probes as never,
  );
  return { svc, now, storage };
}

const keysOn = { enabled: true, activeKid: 'm2', kids: ['m1', 'm2'] };
const pass = (phase: string, failed: number) => ({
  fingerprint: 'fp1',
  activeKid: 'm2',
  phase,
  cursor: '',
  scanned: 10,
  rewritten: 9,
  failed,
  byKid: { m1: { rewritten: 9, failed } },
  startedAt: 'x',
  updatedAt: 'x',
  finishedAt: phase === 'done' ? 'x' : null,
});

describe('SystemHealthService', () => {
  it('everything up: green parts, grey for what is not connected yet, DLQ makes queues yellow', async () => {
    const { svc, now } = build();
    const r = await svc.report(now);
    const by = Object.fromEntries(r.items.map((i) => [i.key, i.status]));
    expect(by).toEqual({
      api: 'green',
      worker: 'green',
      database: 'green',
      redis: 'green',
      storage: 'grey',
      video: 'grey',
      queues: 'yellow',
      backup: 'grey',
      restore_drill: 'grey',
      message_keys: 'grey',
      table_growth: 'grey',
      shard_growth: 'grey',
      cost: 'grey',
    });
    expect(r.overall).toBe('yellow');
    expect(r.actions).toEqual({ onAws: false, budget: false });
  });

  it('database turns yellow when the nightly bloat check names a big table', async () => {
    const { svc, now } = build({ bloatOver: ['messages'] });
    const db = (await svc.report(now)).items.find((i) => i.key === 'database');
    expect(db?.status).toBe('yellow');
    expect(db?.detail).toMatchObject({ bloatOver: ['messages'] });
  });

  it('a dead database and a silent worker are red, the rest still reported', async () => {
    const { svc, now } = build({ dbFails: true, heartbeatAgoSec: null });
    const r = await svc.report(now);
    const by = Object.fromEntries(r.items.map((i) => [i.key, i.status]));
    expect(by.database).toBe('red');
    expect(by.worker).toBe('red');
    expect(by.redis).toBe('green');
    expect(r.overall).toBe('red');
  });

  it('message keys: one kid sealing a billion messages raises the alarm text (S3-2)', async () => {
    const hot = build({
      cipher: keysOn,
      reencryptState: {
        ...pass('done', 0),
        kidRows: { m1: 12, m2: 1_000_000_000 },
      },
    });
    const r = await hot.svc.report(hot.now);
    const tile = r.items.find((i) => i.key === 'message_keys');
    expect(tile?.status).toBe('red');
    expect(tile?.detail.kidRows).toEqual({ m1: 12, m2: 1_000_000_000 });
    expect(String(tile?.detail.alarm)).toContain('«m2»');
    expect(String(tile?.detail.alarm)).toContain('новый ключ');

    const calm = build({
      cipher: keysOn,
      reencryptState: { ...pass('done', 0), kidRows: { m2: 999_999_999 } },
    });
    const ok = (await calm.svc.report(calm.now)).items.find(
      (i) => i.key === 'message_keys',
    );
    expect(ok?.status).toBe('green');
    expect(ok?.detail.alarm).toBeNull();
  });

  it('message keys: yellow while a pass runs, red with stuck rows, green when done and names removable kids', async () => {
    const running = build({
      cipher: keysOn,
      reencryptState: pass('messages', 0),
    });
    const r1 = await running.svc.report(running.now);
    expect(r1.items.find((i) => i.key === 'message_keys')?.status).toBe(
      'yellow',
    );

    const stuck = build({ cipher: keysOn, reencryptState: pass('done', 1) });
    const r2 = await stuck.svc.report(stuck.now);
    const t2 = r2.items.find((i) => i.key === 'message_keys');
    expect(t2?.status).toBe('red');
    expect(t2?.detail.removableKids).toEqual([]);

    const done = build({ cipher: keysOn, reencryptState: pass('done', 0) });
    const r3 = await done.svc.report(done.now);
    const t3 = r3.items.find((i) => i.key === 'message_keys');
    expect(t3?.status).toBe('green');
    expect(t3?.detail).toMatchObject({
      activeKid: 'm2',
      retiredKids: ['m1'],
      removableKids: ['m1'],
    });

    // A retired kid without any pass yet: yellow (the job has not run).
    const idle = build({ cipher: keysOn });
    const r4 = await idle.svc.report(idle.now);
    expect(r4.items.find((i) => i.key === 'message_keys')?.status).toBe(
      'yellow',
    );
  });

  describe('storage probe', () => {
    const item = async (o: Parameters<typeof build>[0]) => {
      const b = build(o);
      const r = await b.svc.report(b.now);
      return {
        it: r.items.find((i) => i.key === 'storage'),
        storage: b.storage,
      };
    };

    it('is green when AWS and R2 both answer, and heads the R2 bucket', async () => {
      const { it, storage } = await item({ s3Bucket: 'aws', r2Bucket: 'r2b' });
      expect(it?.status).toBe('green');
      expect(storage.head).toHaveBeenCalledWith('r2b', 'ops/health-probe');
      expect(it?.detail).toHaveProperty('r2LatencyMs');
    });

    it('is red with the reason when the R2 switch is on but files stay on AWS', async () => {
      const { it } = await item({
        s3Bucket: 'aws',
        r2Bucket: 'r2b',
        r2Fallback: 'Публичный адрес бакета не отвечает.',
      });
      expect(it?.status).toBe('red');
      expect(it?.detail?.r2Fallback).toContain('новые фото идут в AWS');
      expect(it?.detail?.r2Fallback).toContain('не отвечает');
    });

    it('is red with r2Error when only R2 fails', async () => {
      const { it } = await item({
        s3Bucket: 'aws',
        r2Bucket: 'r2b',
        head: (bucket) =>
          bucket === 'r2b'
            ? Promise.reject(new Error('R2 403'))
            : Promise.resolve(null),
      });
      expect(it?.status).toBe('red');
      expect(it?.detail.r2Error).toBe('R2 403');
      expect(it?.detail.error).toBeUndefined();
    });

    it('works with R2 only (no AWS keys) and stays grey with neither', async () => {
      expect((await item({ r2Bucket: 'r2b' })).it?.status).toBe('green');
      expect((await item({})).it?.status).toBe('grey');
    });
  });
});

describe('SystemHealthService.cachedReport', () => {
  function svc(entry: { age: number; data: unknown } | null) {
    const summary = {
      peek: jest.fn(() =>
        Promise.resolve(
          entry
            ? {
                data: entry.data,
                computedAt: new Date(Date.now() - entry.age).toISOString(),
              }
            : null,
        ),
      ),
      refresh: jest.fn((_k: string, compute: () => Promise<unknown>) =>
        compute().then((data) => ({ data, computedAt: 'now' })),
      ),
      put: jest.fn(() => Promise.resolve()),
    };
    const build = jest.fn(() =>
      Promise.resolve({ overall: 'green', generatedAt: 'x', items: [] }),
    );
    const s = Object.assign(
      Object.create(SystemHealthService.prototype) as object,
      { summary, build },
    ) as unknown as SystemHealthService;
    return { s, summary, build };
  }
  const old = (overall: string) => ({ overall, items: [] });

  it('waits for the first computation on a cold cache', async () => {
    const { s, build } = svc(null);
    expect((await s.cachedReport()).overall).toBe('green');
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('serves a fresh entry without computing', async () => {
    const { s, build, summary } = svc({ age: 1_000, data: old('red') });
    expect((await s.cachedReport()).overall).toBe('red');
    expect(build).not.toHaveBeenCalled();
    expect(summary.refresh).not.toHaveBeenCalled();
  });

  it('serves a slightly stale entry at once and refreshes in the background', async () => {
    const { s, summary } = svc({ age: 60_000, data: old('yellow') });
    expect((await s.cachedReport()).overall).toBe('yellow');
    expect(summary.refresh).toHaveBeenCalledTimes(1);
  });

  it('R-370: a 5-minute-old copy opens at once, one refresh runs behind it', async () => {
    const { s, build, summary } = svc({ age: 5 * 60_000, data: old('red') });
    expect((await s.cachedReport()).overall).toBe('red');
    expect(summary.refresh).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledTimes(1); // the background refresh
  });

  it('a copy older than 15 minutes waits for a new report', async () => {
    const { s, build } = svc({ age: 16 * 60_000, data: old('red') });
    expect((await s.cachedReport()).overall).toBe('green');
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('treats a malformed entry as a miss', async () => {
    const { s, build } = svc({ age: 1_000, data: {} });
    expect((await s.cachedReport()).overall).toBe('green');
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('report() computes now and stores the result for the next GET', async () => {
    const { s, summary } = svc(null);
    await s.report();
    expect(summary.put).toHaveBeenCalledWith(
      'ops:system-health',
      expect.objectContaining({ overall: 'green' }),
    );
  });
});

describe('SystemHealthService.shardGrowth', () => {
  const item = (partitions: unknown) =>
    (
      Object.assign(Object.create(SystemHealthService.prototype) as object, {
        partitions,
      }) as unknown as {
        shardGrowth: () => Promise<{ status: string; detail: unknown }>;
      }
    ).shardGrowth();

  it('is grey without the probe or when it fails', async () => {
    expect((await item(undefined)).status).toBe('grey');
    expect(
      (await item({ shardSignal: () => Promise.reject(new Error('x')) }))
        .status,
    ).toBe('grey');
  });

  it('passes the status and the plan of the probe through', async () => {
    const r = await item({
      shardSignal: () =>
        Promise.resolve({
          status: 'yellow',
          ratio: 0.9,
          plan: { shards: 128, rows: 1, estimatedSeconds: 2 },
          autoMove: false,
        }),
    });
    expect(r.status).toBe('yellow');
    expect(r.detail).toMatchObject({ autoMove: false, ratio: 0.9 });
  });
});

describe('SystemHealthService build (R-370)', () => {
  it('hung extra probes cost at most ~4 s; the core lights still show', async () => {
    const { svc, now } = build({
      probes: { extra: () => new Promise<unknown[]>(() => undefined) },
    });
    const started = Date.now();
    const r = await svc.report(now);
    expect(Date.now() - started).toBeLessThan(4_900);
    expect(r.items.find((i) => i.key === 'database')?.status).toBe('green');
  }, 10_000);

  it('the extra probes run together with the core lights, not after them', async () => {
    let extraStarted = false;
    const { svc, now } = build({
      probes: {
        extra: () => {
          extraStarted = true;
          return Promise.resolve([
            { key: 'push', status: 'green', detail: {} },
          ]);
        },
      },
    });
    const p = svc.report(now);
    expect(extraStarted).toBe(true); // started before any core probe answered
    const r = await p;
    expect(r.items.map((i) => i.key)).toContain('push');
  });
});
