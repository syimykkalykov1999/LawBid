import { AdminSummaryService } from './admin-summary.service';

/** A tiny in-memory stand-in for the ioredis calls the service makes. */
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

describe('AdminSummaryService', () => {
  it('computes once and serves the stored value afterwards', async () => {
    const redis = fakeRedis();
    const svc = new AdminSummaryService(redis as never);
    const compute = jest.fn(() => Promise.resolve({ n: 1 }));
    const a = await svc.get('k', compute, 60);
    const b = await svc.get('k', compute, 60);
    expect(a.data).toEqual({ n: 1 });
    expect(b.computedAt).toBe(a.computedAt);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('shares one computation between concurrent cold readers', async () => {
    const redis = fakeRedis();
    const svc = new AdminSummaryService(redis as never);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const compute = jest.fn(() => gate.then(() => 42));
    const all = Promise.all([
      svc.get('k', compute, 60),
      svc.get('k', compute, 60),
      svc.get('k', compute, 60),
    ]);
    release();
    const results = await all;
    expect(results.map((r) => r.data)).toEqual([42, 42, 42]);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('serves a stale value at once and refreshes in the background', async () => {
    const redis = fakeRedis();
    const svc = new AdminSummaryService(redis as never);
    redis.store.set(
      'adm:sum:k',
      JSON.stringify({
        data: 'old',
        computedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      }),
    );
    const compute = jest.fn(() => Promise.resolve('new'));
    const got = await svc.get('k', compute, 60);
    expect(got.data).toBe('old');
    await new Promise((r) => setTimeout(r, 20));
    expect(compute).toHaveBeenCalledTimes(1);
    expect((await svc.peek<string>('k'))?.data).toBe('new');
  });

  it('keeps the last good value when a refresh fails', async () => {
    const redis = fakeRedis();
    const svc = new AdminSummaryService(redis as never);
    await svc.refresh('k', () => Promise.resolve('good'));
    await expect(
      svc.refresh('k', () => Promise.reject(new Error('db down'))),
    ).rejects.toThrow('db down');
    expect((await svc.peek<string>('k'))?.data).toBe('good');
    // …and the lock is released, so the next refresh can run.
    await expect(
      svc.refresh('k', () => Promise.resolve('again')),
    ).resolves.toMatchObject({
      data: 'again',
    });
  });

  it('answers from compute when Redis is down', async () => {
    const redis = {
      get: jest.fn().mockRejectedValue(new Error('down')),
      set: jest.fn().mockRejectedValue(new Error('down')),
      del: jest.fn().mockRejectedValue(new Error('down')),
    };
    const svc = new AdminSummaryService(redis as never);
    const r = await svc.get('k', () => Promise.resolve(7), 60);
    expect(r.data).toBe(7);
  });

  describe('row 78: a cold key is counted once across processes', () => {
    // Two API processes = two services on one Redis (the in-process promise
    // cannot help across them; only the lock does).
    it('a waiter keeps waiting while the holder still counts (no second count after 4 s)', async () => {
      jest.useFakeTimers();
      try {
        const redis = fakeRedis();
        const holder = new AdminSummaryService(redis as never);
        const waiter = new AdminSummaryService(redis as never);
        let release!: (v: number) => void;
        const slow = jest.fn(() => new Promise<number>((r) => (release = r)));
        const other = jest.fn(() => Promise.resolve(-1));
        const first = holder.get('k', slow, 60);
        await jest.advanceTimersByTimeAsync(0);
        const second = waiter.get('k', other, 60);
        // 25 s of counting at 10M users: far past the old 4 s give-up.
        await jest.advanceTimersByTimeAsync(25_000);
        expect(other).not.toHaveBeenCalled();
        release(42);
        await jest.advanceTimersByTimeAsync(300);
        expect((await first).data).toBe(42);
        expect((await second).data).toBe(42);
        expect(slow).toHaveBeenCalledTimes(1);
        expect(other).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('a waiter counts by itself once the holder died (lock gone, nothing stored)', async () => {
      jest.useFakeTimers();
      try {
        const redis = fakeRedis();
        // A holder that crashed mid-count: its lock is there, then expires.
        redis.store.set('adm:sum:lock:k', '1');
        const svc = new AdminSummaryService(redis as never);
        const compute = jest.fn(() => Promise.resolve(5));
        const got = svc.get('k', compute, 60);
        await jest.advanceTimersByTimeAsync(10_000);
        expect(compute).not.toHaveBeenCalled();
        redis.store.delete('adm:sum:lock:k');
        await jest.advanceTimersByTimeAsync(5_000);
        expect((await got).data).toBe(5);
        expect(compute).toHaveBeenCalledTimes(1);
        // …and its own lock is released afterwards.
        expect(redis.store.has('adm:sum:lock:k')).toBe(false);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});

describe('AdminSummaryService.keepWarm (R-370)', () => {
  const ACTIVE = 'ops:admin-active';
  const aged = (ms: number) =>
    JSON.stringify({
      data: { n: 0 },
      computedAt: new Date(Date.now() - ms).toISOString(),
    });

  it('does nothing while no admin is looking', async () => {
    const redis = fakeRedis();
    const svc = new AdminSummaryService(redis as never);
    const compute = jest.fn(() => Promise.resolve({ n: 1 }));
    expect(await svc.warmOnce('k', compute, 60_000)).toBe(false);
    expect(compute).not.toHaveBeenCalled();
  });

  it('recomputes an old copy while an admin is active', async () => {
    const redis = fakeRedis();
    redis.store.set(ACTIVE, '1');
    redis.store.set('adm:sum:k', aged(5 * 60_000));
    const svc = new AdminSummaryService(redis as never);
    const compute = jest.fn(() => Promise.resolve({ n: 1 }));
    expect(await svc.warmOnce('k', compute, 60_000)).toBe(true);
    expect((await svc.peek<{ n: number }>('k'))?.data.n).toBe(1);
  });

  it('leaves a fresh copy alone', async () => {
    const redis = fakeRedis();
    redis.store.set(ACTIVE, '1');
    redis.store.set('adm:sum:k', aged(1_000));
    const svc = new AdminSummaryService(redis as never);
    const compute = jest.fn(() => Promise.resolve({ n: 1 }));
    expect(await svc.warmOnce('k', compute, 60_000)).toBe(false);
    expect(compute).not.toHaveBeenCalled();
  });

  it('ticks on its timer and stops when asked', async () => {
    jest.useFakeTimers();
    try {
      const redis = fakeRedis();
      redis.store.set(ACTIVE, '1');
      const svc = new AdminSummaryService(redis as never);
      const compute = jest.fn(() => Promise.resolve({ n: 1 }));
      const stop = svc.keepWarm('k', compute, 60_000, 1_000);
      await jest.advanceTimersByTimeAsync(1_000);
      expect(compute).toHaveBeenCalledTimes(1);
      stop();
      redis.store.delete('adm:sum:k');
      await jest.advanceTimersByTimeAsync(5_000);
      expect(compute).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  /** R-403: one copy per country scope; an action forgets them all. */
  it('keeps a copy per scope and dropFamily forgets every one', async () => {
    const store = new Map<string, string>();
    const scopes = new Set<string>();
    const redis = {
      get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
      set: jest.fn((k: string, v: string) => {
        store.set(k, v);
        return Promise.resolve('OK');
      }),
      del: jest.fn((...keys: string[]) => {
        keys.forEach((k) => store.delete(k));
        return Promise.resolve(keys.length);
      }),
      sadd: jest.fn((_k: string, m: string) => {
        scopes.add(m);
        return Promise.resolve(1);
      }),
      expire: jest.fn(() => Promise.resolve(1)),
      smembers: jest.fn(() => Promise.resolve([...scopes])),
    };
    const svc = new AdminSummaryService(redis as never);
    const all = jest.fn(() => Promise.resolve(5));
    const us = jest.fn(() => Promise.resolve(2));
    expect((await svc.getScoped('c', null, all, 30)).data).toBe(5);
    expect((await svc.getScoped('c', 'US', us, 30)).data).toBe(2);
    await svc.getScoped('c', null, all, 30);
    await svc.getScoped('c', 'US', us, 30);
    expect(all).toHaveBeenCalledTimes(1);
    expect(us).toHaveBeenCalledTimes(1);

    await svc.dropFamily('c');
    await svc.getScoped('c', null, all, 30);
    await svc.getScoped('c', 'US', us, 30);
    expect(all).toHaveBeenCalledTimes(2);
    expect(us).toHaveBeenCalledTimes(2);
  });

  it('dropFamily survives Redis being down', async () => {
    const redis = {
      smembers: jest.fn(() => Promise.reject(new Error('down'))),
    };
    const svc = new AdminSummaryService(redis as never);
    await expect(svc.dropFamily('c')).resolves.toBeUndefined();
  });
});

describe('AdminSummaryService.board (2026-11-08: boards never rebuild inside the request)', () => {
  const age = (
    redis: ReturnType<typeof fakeRedis>,
    key: string,
    ms: number,
  ) => {
    const k = `adm:sum:${key}`;
    const v = JSON.parse(redis.store.get(k)!) as { computedAt: string };
    v.computedAt = new Date(Date.now() - ms).toISOString();
    redis.store.set(k, JSON.stringify(v));
  };

  it('the first ever read waits; concurrent first readers share one build', async () => {
    const svc = new AdminSummaryService(fakeRedis() as never);
    const compute = jest.fn(() => Promise.resolve({ items: [1] }));
    const [a, b] = await Promise.all([
      svc.board('b', compute, 15_000),
      svc.board('b', compute, 15_000),
    ]);
    expect(a).toEqual({ items: [1] });
    expect(b).toEqual({ items: [1] });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('a fresh copy is served without any build', async () => {
    const svc = new AdminSummaryService(fakeRedis() as never);
    const compute = jest.fn(() => Promise.resolve({ items: [1] }));
    await svc.board('b', compute, 15_000);
    await svc.board('b', compute, 15_000);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('a copy of ANY age is served at once while one build runs behind it', async () => {
    const redis = fakeRedis();
    const svc = new AdminSummaryService(redis as never);
    await svc.board('b', () => Promise.resolve({ items: ['old'] }), 15_000);
    age(redis, 'b', 20 * 3600_000); // 20 hours: the owner comes back next day
    const slow = jest.fn(
      () => new Promise<{ items: string[] }>(() => undefined),
    );
    const started = Date.now();
    const r = await svc.board('b', slow, 15_000);
    expect(Date.now() - started).toBeLessThan(200);
    expect(r).toEqual({ items: ['old'] });
    expect(slow).toHaveBeenCalledTimes(1); // the background build
  });

  it('a copy that fails [valid] counts as missing', async () => {
    const redis = fakeRedis();
    const svc = new AdminSummaryService(redis as never);
    await svc.put('b', { nope: true });
    const compute = jest.fn(() => Promise.resolve({ items: [2] }));
    const r = await svc.board<{ items?: number[] }>(
      'b',
      compute,
      15_000,
      (d) => !!d?.items,
    );
    expect(r).toEqual({ items: [2] });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('drop() makes the next read build again', async () => {
    const svc = new AdminSummaryService(fakeRedis() as never);
    const compute = jest.fn(() => Promise.resolve({ items: [1] }));
    await svc.board('b', compute, 15_000);
    await svc.drop('b');
    await svc.board('b', compute, 15_000);
    expect(compute).toHaveBeenCalledTimes(2);
  });
});

/** Speed matrix 2026-11-09 (§3 #5): change announcements for the admin socket. */
describe('AdminSummaryService change announcements', () => {
  function withPublish() {
    const redis = fakeRedis() as ReturnType<typeof fakeRedis> & {
      publish: jest.Mock<Promise<number>, [string, string]>;
    };
    redis.publish = jest.fn<Promise<number>, [string, string]>(() =>
      Promise.resolve(1),
    );
    return redis;
  }

  it('announces a refresh only when the stored data changed', async () => {
    const redis = withPublish();
    const svc = new AdminSummaryService(redis as never);
    let n = 1;
    const compute = jest.fn(() => Promise.resolve({ n }));
    await svc.refresh('counts', compute);
    expect(redis.publish).toHaveBeenCalledWith('adm:changed', 'counts');
    redis.publish.mockClear();
    await svc.refresh('counts', compute); // same numbers
    expect(redis.publish).not.toHaveBeenCalled();
    n = 2;
    await svc.refresh('counts', compute);
    expect(redis.publish).toHaveBeenCalledTimes(1);
  });

  it('a scoped copy is announced under its family; drop / put announce too', async () => {
    const redis = withPublish();
    const svc = new AdminSummaryService(redis as never);
    await svc.getScoped(
      'admin-counts',
      'US',
      () => Promise.resolve({ q: 1 }),
      30,
    );
    expect(redis.publish).toHaveBeenCalledWith('adm:changed', 'admin-counts');
    redis.publish.mockClear();
    await svc.drop('board');
    await svc.put('other', { x: 1 });
    await svc.dropFamily('admin-counts');
    expect(redis.publish.mock.calls.map((c) => c[1])).toEqual([
      'board',
      'other',
      'admin-counts',
    ]);
  });

  it('a Redis client without publish (tests, doubles) is simply quiet', async () => {
    const svc = new AdminSummaryService(fakeRedis() as never);
    await expect(svc.put('k', { a: 1 })).resolves.toBeUndefined();
    svc.notifyChanged('k');
  });
});
