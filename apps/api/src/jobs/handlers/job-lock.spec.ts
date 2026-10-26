/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unused-vars */
import type Redis from 'ioredis';
import { RENEW, withJobLock } from './job-lock';

/** In-memory stand-in for the three Redis calls the lock uses. */
function fakeRedis(opts: { renew?: () => number | Promise<number> } = {}) {
  const store = new Map<string, string>();
  const evals: string[] = [];
  const redis = {
    set: jest.fn(async (k: string, v: string, ..._a: unknown[]) => {
      if (store.has(k)) return null;
      store.set(k, v);
      return 'OK';
    }),
    eval: jest.fn(async (script: string, _n: number, k: string, t: string) => {
      if (script === RENEW) {
        evals.push('renew');
        if (opts.renew) return opts.renew();
        return store.get(k) === t ? 1 : 0;
      }
      evals.push('release');
      if (store.get(k) === t) {
        store.delete(k);
        return 1;
      }
      return 0;
    }),
  };
  return { redis: redis as unknown as Redis, store, evals, raw: redis };
}

describe('withJobLock', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('runs fn, releases the lock, returns the result', async () => {
    const { redis, store } = fakeRedis();
    expect(await withJobLock(redis, 'a', 9000, async () => 42)).toBe(42);
    expect(store.size).toBe(0);
  });

  it('returns null without running fn while another holder has the lock', async () => {
    const { redis, store } = fakeRedis();
    store.set('lock:job:a', 'someone-else');
    const fn = jest.fn();
    expect(await withJobLock(redis, 'a', 9000, fn)).toBeNull();
    expect(fn).not.toHaveBeenCalled();
    expect(store.get('lock:job:a')).toBe('someone-else');
  });

  it('renews at 1/3 of the TTL while a long fn runs', async () => {
    const { redis, evals, raw } = fakeRedis();
    const p = withJobLock(redis, 'slow', 9000, async () => {
      await new Promise((r) => setTimeout(r, 10_000));
      return 'done';
    });
    await jest.advanceTimersByTimeAsync(10_000);
    expect(await p).toBe('done');
    // ticks at 3 s, 6 s, 9 s
    expect(evals.filter((e) => e === 'renew')).toHaveLength(3);
    expect(raw.eval).toHaveBeenCalledWith(
      RENEW,
      1,
      'lock:job:slow',
      expect.any(String),
      9000,
    );
    expect(evals.at(-1)).toBe('release');
  });

  it('aborts and returns null when the lock is lost; the stale holder does not delete the new owner key', async () => {
    const { redis, store } = fakeRedis();
    let signal: AbortSignal | undefined;
    const p = withJobLock(redis, 'lost', 9000, async (ctx) => {
      signal = ctx.signal;
      await new Promise((r) => setTimeout(r, 60_000));
      return 'late';
    });
    await jest.advanceTimersByTimeAsync(1000);
    store.set('lock:job:lost', 'other-pod'); // expired and taken over
    await jest.advanceTimersByTimeAsync(3000);
    expect(await p).toBeNull();
    expect(signal?.aborted).toBe(true);
    expect(store.get('lock:job:lost')).toBe('other-pod');
  });

  it('a Redis error while renewing is not a loss', async () => {
    let n = 0;
    const { redis } = fakeRedis({
      renew: () => {
        n += 1;
        if (n === 1) throw new Error('timeout');
        return 1;
      },
    });
    const p = withJobLock(redis, 'blip', 9000, async (ctx) => {
      await new Promise((r) => setTimeout(r, 7000));
      return ctx.signal.aborted ? 'aborted' : 'ok';
    });
    await jest.advanceTimersByTimeAsync(7000);
    expect(await p).toBe('ok');
  });

  it('releases and rethrows when fn throws, and stops renewing', async () => {
    const { redis, store, evals } = fakeRedis();
    await expect(
      withJobLock(redis, 'boom', 9000, async () => {
        throw new Error('x');
      }),
    ).rejects.toThrow('x');
    expect(store.size).toBe(0);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(evals.filter((e) => e === 'renew')).toHaveLength(0);
  });
});
