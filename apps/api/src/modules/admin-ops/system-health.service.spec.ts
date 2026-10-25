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
    head?: (bucket: string) => Promise<unknown>;
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
      message_keys: 'grey',
      table_growth: 'grey',
      cost: 'grey',
    });
    expect(r.overall).toBe('yellow');
    expect(r.actions).toEqual({ onAws: false, budget: false });
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
