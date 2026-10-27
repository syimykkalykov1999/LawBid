import type Redis from 'ioredis';
import { cached } from './cached';
import { L1Cache } from './l1-cache';

function fake(opts: { failAll?: boolean } = {}) {
  const store = new Map<string, string>();
  const redis = {
    get: jest.fn((k: string) =>
      opts.failAll
        ? Promise.reject(new Error('down'))
        : Promise.resolve(store.get(k) ?? null),
    ),
    set: jest.fn((k: string, v: string, ...args: unknown[]) => {
      if (opts.failAll) return Promise.reject(new Error('down'));
      if (args.includes('NX') && store.has(k)) return Promise.resolve(null);
      store.set(k, v);
      return Promise.resolve('OK');
    }),
    del: jest.fn((k: string) => {
      store.delete(k);
      return Promise.resolve(1);
    }),
  };
  return { redis: redis as unknown as Redis, store, mock: redis };
}

describe('cached()', () => {
  it('loads once, then serves from Redis', async () => {
    const { redis, store } = fake();
    const loader = jest.fn(() => Promise.resolve({ a: 1 }));
    expect(await cached(redis, 'k1', { ttlSec: 60 }, loader)).toEqual({ a: 1 });
    expect(await cached(redis, 'k1', { ttlSec: 60 }, loader)).toEqual({ a: 1 });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(store.get('k1')).toBe('{"a":1}');
    // the lease is released
    expect(store.has('k1:lease')).toBe(false);
  });

  it('sets the key with a jittered TTL around ttlSec', async () => {
    const { redis, mock } = fake();
    await cached(redis, 'k2', { ttlSec: 100, jitter: 0.2 }, () =>
      Promise.resolve(1),
    );
    const call = mock.set.mock.calls.find((c) => c[0] === 'k2')!;
    expect(call[2]).toBe('EX');
    expect(call[3]).toBeGreaterThanOrEqual(80);
    expect(call[3]).toBeLessThanOrEqual(120);
  });

  it('shares one load between concurrent callers of a process', async () => {
    const { redis } = fake();
    let release!: (v: number) => void;
    const loader = jest.fn(() => new Promise<number>((r) => (release = r)));
    const a = cached(redis, 'k3', { ttlSec: 60 }, loader);
    const b = cached(redis, 'k3', { ttlSec: 60 }, loader);
    await new Promise((r) => setTimeout(r, 5));
    release(7);
    expect(await Promise.all([a, b])).toEqual([7, 7]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('another pod holding the lease: waits and reads its value', async () => {
    const { redis, store } = fake();
    store.set('k4:lease', '1');
    const loader = jest.fn(() => Promise.resolve('mine'));
    setTimeout(() => store.set('k4', JSON.stringify('theirs')), 20);
    expect(
      await cached(redis, 'k4', { ttlSec: 60, leaseWaitMs: 90 }, loader),
    ).toBe('theirs');
    expect(loader).not.toHaveBeenCalled();
    // does not delete somebody else's lease
    expect(store.has('k4:lease')).toBe(true);
  });

  it('lease holder never filled it: loads anyway after the wait', async () => {
    const { redis, store } = fake();
    store.set('k5:lease', '1');
    const loader = jest.fn(() => Promise.resolve('mine'));
    expect(
      await cached(redis, 'k5', { ttlSec: 60, leaseWaitMs: 30 }, loader),
    ).toBe('mine');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('a dead Redis is a miss, never an error', async () => {
    const { redis } = fake({ failAll: true });
    const loader = jest.fn(() => Promise.resolve(42));
    expect(
      await cached(redis, 'k6', { ttlSec: 60, leaseWaitMs: 20 }, loader),
    ).toBe(42);
  });

  it('garbage in Redis is a miss; custom serialize/parse work', async () => {
    const { redis, store } = fake();
    store.set('k7', 'not-json');
    expect(
      await cached(redis, 'k7', { ttlSec: 60 }, () => Promise.resolve(true)),
    ).toBe(true);
    const opts = {
      ttlSec: 60,
      serialize: (v: boolean) => (v ? '1' : '0'),
      parse: (r: string) => r === '1',
    };
    expect(await cached(redis, 'k8', opts, () => Promise.resolve(false))).toBe(
      false,
    );
    expect(store.get('k8')).toBe('0');
    expect(await cached(redis, 'k8', opts, () => Promise.resolve(true))).toBe(
      false,
    );
  });

  it('a loader error propagates and releases the lease', async () => {
    const { redis, store } = fake();
    await expect(
      cached(redis, 'k9', { ttlSec: 60 }, () =>
        Promise.reject(new Error('db')),
      ),
    ).rejects.toThrow('db');
    expect(store.has('k9:lease')).toBe(false);
  });
});

describe('L1Cache', () => {
  it('serves from memory for the TTL, then reloads', async () => {
    let t = 0;
    const l1 = new L1Cache<number>('t', {
      ttlMs: 5000,
      enabled: true,
      now: () => t,
    });
    const load = jest.fn(() => Promise.resolve(1));
    await l1.getOrLoad('k', load);
    t = 4000;
    await l1.getOrLoad('k', load);
    expect(load).toHaveBeenCalledTimes(1);
    t = 5000;
    await l1.getOrLoad('k', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('delete / clear are the invalidation hook', async () => {
    const l1 = new L1Cache<string>('t2', { ttlMs: 5000, enabled: true });
    const load = jest.fn(() => Promise.resolve('v'));
    await l1.getOrLoad('k', load);
    l1.delete('k');
    await l1.getOrLoad('k', load);
    l1.clear();
    await l1.getOrLoad('k', load);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('is off with ttl 0 or when disabled, and bounded', async () => {
    const off = new L1Cache<number>('t3', { ttlMs: 0, enabled: true });
    const load = jest.fn(() => Promise.resolve(1));
    await off.getOrLoad('k', load);
    await off.getOrLoad('k', load);
    expect(load).toHaveBeenCalledTimes(2);

    const small = new L1Cache<number>('t4', {
      ttlMs: 5000,
      enabled: true,
      maxEntries: 2,
    });
    small.set('a', 1);
    small.set('b', 2);
    small.set('c', 3);
    expect(small.get('a')).toBeUndefined();
    expect(small.get('c')).toBe(3);
  });
});
