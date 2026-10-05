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
  over: { dbFails?: boolean; heartbeatAgoSec?: number | null } = {},
) {
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
    get: (k: string) => ({ REDIS_URL: 'redis://x' })[k],
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
  const storage = { head: jest.fn(), bucket: jest.fn(() => 'media') };
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
  );
  return { svc, now };
}

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
});
