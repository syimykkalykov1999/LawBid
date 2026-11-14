import { RENEW } from './handlers/job-lock';
import {
  parseTimeoutList,
  runUnderLock,
  staleJobs,
  timeLimitMs,
} from './cron-run';
import {
  JobStoppedError,
  currentJobSignal,
  runWithJobSignal,
  throwIfJobStopped,
} from '../common/queues/job-signal';
import { jobStopExtension } from '../prisma/job-stop.extension';

function lockRedis() {
  const kv = new Map<string, string>();
  const state = { lose: false };
  return {
    kv,
    state,
    set: jest.fn((k: string, v: string) => {
      if (kv.has(k)) return Promise.resolve(null);
      kv.set(k, v);
      return Promise.resolve('OK');
    }),
    eval: jest.fn((script: string, _n: number, k: string, token: string) => {
      if (script === RENEW) {
        if (state.lose) kv.delete(k);
        return Promise.resolve(kv.get(k) === token ? 1 : 0);
      }
      if (kv.get(k) === token) {
        kv.delete(k);
        return Promise.resolve(1);
      }
      return Promise.resolve(0);
    }),
  };
}

const tick = (ms: number) => new Promise((res) => setTimeout(res, ms));

describe('runUnderLock', () => {
  it('runs once, returns the value and frees the lock', async () => {
    const redis = lockRedis();
    const r = await runUnderLock({
      redis: redis as never,
      key: 'k',
      ttlMs: 60_000,
      timeLimitMs: null,
      fn: () => Promise.resolve(7),
    });
    expect(r).toEqual({ acquired: true, value: 7 });
    expect(redis.kv.has('k')).toBe(false);
  });

  it('a held lock: does not run', async () => {
    const redis = lockRedis();
    redis.kv.set('k', 'other');
    const fn = jest.fn(() => Promise.resolve(1));
    await expect(
      runUnderLock({
        redis: redis as never,
        key: 'k',
        ttlMs: 60_000,
        timeLimitMs: null,
        fn,
      }),
    ).resolves.toEqual({ acquired: false });
    expect(fn).not.toHaveBeenCalled();
  });

  it('time limit: stops, does not renew any more, releases the lock once the run settles', async () => {
    const redis = lockRedis();
    let finish!: () => void;
    const fn = () => new Promise<void>((res) => (finish = res));
    await expect(
      runUnderLock({
        redis: redis as never,
        key: 'k',
        ttlMs: 60_000,
        timeLimitMs: 10,
        fn,
      }),
    ).rejects.toBeInstanceOf(JobStoppedError);
    // still ours while the stopped run has not settled: no second copy
    expect(redis.kv.has('k')).toBe(true);
    finish();
    await tick(1);
    expect(redis.kv.has('k')).toBe(false);
  });

  it('lock lost: the stopped run is not released over someone else', async () => {
    const redis = lockRedis();
    let finish!: () => void;
    const run = runUnderLock({
      redis: redis as never,
      key: 'k',
      ttlMs: 30,
      timeLimitMs: null,
      fn: () => new Promise<void>((res) => (finish = res)),
    });
    await tick(2);
    redis.state.lose = true;
    await expect(run).rejects.toThrow(/lock lost/);
    redis.state.lose = false;
    redis.kv.set('k', 'second-copy');
    finish();
    await tick(1);
    expect(redis.kv.get('k')).toBe('second-copy');
  });

  it('without Redis: still time-limited', async () => {
    await expect(
      runUnderLock({
        key: 'k',
        ttlMs: 60_000,
        timeLimitMs: 5,
        fn: () => new Promise(() => undefined),
      }),
    ).rejects.toThrow(/time limit/);
  });
});

describe('job signal scope', () => {
  it('outside a job nothing is stopped; inside, an aborted signal throws', async () => {
    expect(() => throwIfJobStopped()).not.toThrow();
    const c = new AbortController();
    const { work } = runWithJobSignal(c.signal, async () => {
      throwIfJobStopped(); // not stopped yet
      c.abort(new JobStoppedError('lock lost'));
      await Promise.resolve();
      throwIfJobStopped();
    });
    await expect(work).rejects.toThrow(/lock lost/);
  });

  it('after release a timer the job created is never stopped by it', async () => {
    const c = new AbortController();
    let fire!: () => void;
    const seen = new Promise<AbortSignal | undefined>((res) => {
      fire = () => undefined;
      const { release } = runWithJobSignal(c.signal, () => {
        // a timer created inside the job keeps its async context
        const t = setTimeout(() => res(currentJobSignal()), 5);
        fire = () => clearTimeout(t);
        return Promise.resolve();
      });
      c.abort();
      release();
    });
    expect(await seen).toBeUndefined();
    fire();
  });

  it('the Prisma hook refuses the next query of a stopped job, before it is sent', async () => {
    const ext = jobStopExtension() as unknown as {
      query: {
        $allOperations: (p: {
          args: unknown;
          query: (a: unknown) => Promise<unknown>;
        }) => Promise<unknown>;
      };
    };
    // Prisma.defineExtension returns a function of the client in Prisma 7
    const def =
      typeof ext === 'function'
        ? (
            ext as unknown as (c: {
              $extends: (d: unknown) => unknown;
            }) => unknown
          )({ $extends: (d: unknown) => d })
        : ext;
    const hook = (def as typeof ext).query.$allOperations;
    const query = jest.fn(() => Promise.resolve('row'));
    await expect(hook({ args: {}, query })).resolves.toBe('row');
    const c = new AbortController();
    c.abort(new JobStoppedError('time limit 60 min'));
    const { work } = runWithJobSignal(c.signal, () =>
      hook({ args: {}, query }),
    );
    await expect(work).rejects.toThrow(/time limit 60 min/);
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('time limit settings', () => {
  const base = { mode: 'auto', factor: 10, minMinutes: 60, list: '' };
  it('parses the per-job list', () => {
    expect([
      ...parseTimeoutList('feed.reco=30, legal.exports = 10,bad, x=0'),
    ]).toEqual([
      ['feed.reco', 30],
      ['legal.exports', 10],
    ]);
  });

  it('on: the listed minutes, auto for the others', () => {
    const s = { ...base, mode: 'on', list: 'feed.reco=30' };
    expect(timeLimitMs('feed.reco', s, [])).toBe(30 * 60_000);
    expect(timeLimitMs('other', s, [])).toBeNull();
    expect(timeLimitMs('other', s, [120 * 60_000])).toBe(1200 * 60_000);
  });
});

describe('staleJobs', () => {
  const now = Date.UTC(2026, 10, 14, 12);
  it('a job never tried is not reported (no record yet)', () => {
    expect(
      staleJobs({}, [{ name: 'a', pattern: '* * * * *' }], now, 3),
    ).toEqual([]);
  });
});
