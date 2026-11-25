/* eslint-disable @typescript-eslint/unbound-method */
import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { DelayedError, Worker } from 'bullmq';
import type { CronProcessor } from './cron.processor';
import { CRON_QUEUE } from './jobs.constants';
import {
  CRON_HANDOFF_DELAY_MS,
  CRON_RELEASES_KEY,
  CRON_RELEASE_TTL_MS,
  JobsRunner,
  MY_CRON_RELEASE,
} from './jobs.runner';

jest.mock('../redis/redis-connection', () => ({
  ...jest.requireActual<typeof import('../redis/redis-connection')>(
    '../redis/redis-connection',
  ),
  bullOptions: () => ({ connection: {} }),
}));

jest.mock('bullmq', () => {
  // One queue per lane; only the `cron` lane holds a scheduler of the NEXT
  // release, which this one does not know.
  const queues = new Map<string, Record<string, jest.Mock>>();
  const queueFor = (lane: string) => {
    if (!queues.has(lane)) {
      queues.set(lane, {
        upsertJobScheduler: jest.fn(() => Promise.resolve({})),
        getJobSchedulers: jest.fn(() =>
          Promise.resolve(lane === 'cron' ? [{ key: 'next.release.job' }] : []),
        ),
        removeJobScheduler: jest.fn(() => Promise.resolve(true)),
        close: jest.fn(() => Promise.resolve()),
      });
    }
    return queues.get(lane);
  };
  const worker = {
    on: jest.fn(),
    close: jest.fn(() => Promise.resolve()),
    isRunning: () => true,
  };
  return {
    ...jest.requireActual<typeof import('bullmq')>('bullmq'),
    Queue: jest.fn((lane: string) => queueFor(lane)),
    Worker: jest.fn(() => worker),
    __queues: queues,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mocked = require('bullmq') as {
  __queues: Map<string, Record<string, jest.Mock>>;
};
const cronQueue = () => mocked.__queues.get(CRON_QUEUE)!;

const logger = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as PinoLogger;

/** A one-key Redis hash, enough for the release list. */
function memRedis(initial: Record<string, string> = {}) {
  const h = new Map(Object.entries(initial));
  return {
    hash: h,
    hset: jest.fn((_k: string, f: string, v: string) => {
      h.set(f, v);
      return Promise.resolve(1);
    }),
    hgetall: jest.fn(() => Promise.resolve(Object.fromEntries(h))),
    hdel: jest.fn((_k: string, f: string) => {
      h.delete(f);
      return Promise.resolve(1);
    }),
    set: jest.fn(() => Promise.resolve('OK')),
  };
}

function runner(redis: ReturnType<typeof memRedis>) {
  const proc = {
    process: jest.fn((name: string) =>
      Promise.reject(new Error(`Unknown cron job: ${name}`)),
    ),
    runOneOff: jest.fn(),
  } as unknown as CronProcessor;
  const r = new JobsRunner(
    { mode: 'worker' },
    {
      get: () => 'redis://x',
      getOrThrow: () => 'redis://x',
    } as unknown as ConfigService,
    proc,
    logger,
    redis as never,
  );
  return { r, proc };
}

const nextRelease = (at: number) =>
  JSON.stringify({ at, names: [`${CRON_QUEUE}:next.release.job`] });

describe('JobsRunner during a deploy (pack C, round 2 #12)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked.__queues.clear();
  });

  it("keeps a live newer release's scheduler instead of deleting it", async () => {
    const redis = memRedis({ next: nextRelease(Date.now()) });
    const { r } = runner(redis);
    await r.onApplicationBootstrap();
    expect(cronQueue().removeJobScheduler).not.toHaveBeenCalledWith(
      'next.release.job',
    );
    // This release announced itself for the other one.
    expect(redis.hset).toHaveBeenCalledWith(
      CRON_RELEASES_KEY,
      MY_CRON_RELEASE,
      expect.any(String),
    );
    await r.onApplicationShutdown();
  });

  it("hands a live newer release's job back to the queue instead of failing it", async () => {
    const redis = memRedis({ next: nextRelease(Date.now()) });
    const { r, proc } = runner(redis);
    await r.onApplicationBootstrap();
    const call = (Worker as unknown as jest.Mock).mock.calls.find(
      ([lane]) => lane === CRON_QUEUE,
    );
    const fn = call?.[1] as (
      job: unknown,
      token?: string,
      signal?: AbortSignal,
    ) => Promise<unknown>;
    const job = {
      name: 'next.release.job',
      moveToDelayed: jest.fn(() => Promise.resolve()),
    };
    const before = Date.now();
    await expect(fn(job, 'tok')).rejects.toBeInstanceOf(DelayedError);
    expect(job.moveToDelayed).toHaveBeenCalledWith(expect.any(Number), 'tok');
    const [[at]] = job.moveToDelayed.mock.calls as unknown as [[number]];
    expect(at).toBeGreaterThanOrEqual(before + CRON_HANDOFF_DELAY_MS);
    expect(proc.process).not.toHaveBeenCalled();
    await r.onApplicationShutdown();
  });

  it('a release gone longer than the TTL: its scheduler is cleaned, its jobs fail as unknown', async () => {
    const redis = memRedis({
      next: nextRelease(Date.now() - CRON_RELEASE_TTL_MS - 1),
    });
    const { r } = runner(redis);
    await r.onApplicationBootstrap();
    expect(cronQueue().removeJobScheduler).toHaveBeenCalledWith(
      'next.release.job',
    );
    expect(redis.hash.has('next')).toBe(false);
    const call = (Worker as unknown as jest.Mock).mock.calls.find(
      ([lane]) => lane === CRON_QUEUE,
    );
    const fn = call?.[1] as (job: unknown, token?: string) => Promise<unknown>;
    const job = { name: 'next.release.job', moveToDelayed: jest.fn() };
    await expect(fn(job, 'tok')).rejects.toThrow('Unknown cron job');
    expect(job.moveToDelayed).not.toHaveBeenCalled();
    await r.onApplicationShutdown();
  });
});
