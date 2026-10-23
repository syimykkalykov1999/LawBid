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
});
