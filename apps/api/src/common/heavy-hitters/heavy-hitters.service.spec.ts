import Redis from 'ioredis';
import { caseIdOf } from './heavy-hitters.interceptor';
import { HeavyHittersService } from './heavy-hitters.service';

const URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/**
 * The Lua scripts are the point of this service, so these run against a real
 * Redis (the dev docker one / the CI service container). Without one the
 * suite is skipped instead of failing.
 */
describe('HeavyHittersService (real Redis)', () => {
  let redis: Redis;
  let up = false;
  const prefix = `{hhtest${process.pid}}`;

  beforeAll(async () => {
    redis = new Redis(URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    redis.on('error', () => undefined);
    try {
      await redis.connect();
      await redis.ping();
      up = true;
    } catch {
      up = false;
    }
  });

  afterAll(async () => {
    if (up) {
      const keys = await redis.keys(`${prefix}:*`);
      if (keys.length) await redis.del(...keys);
    }
    redis.disconnect();
  });

  const make = (sample = 1) => {
    const s = new HeavyHittersService(redis, {
      get: (k: string) => (k === 'HEAVY_HITTERS_SAMPLE' ? sample : undefined),
    } as never);
    s.prefix = prefix;
    return s;
  };

  it('ranks ids by summed weight and sums across buckets', async () => {
    if (!up) return;
    const s = make();
    const t0 = Date.UTC(2026, 9, 25, 12, 0, 0);
    s.record('messages', 'user', 'a', 5);
    s.record('messages', 'user', 'b', 20);
    s.record('messages', 'user', 'a', 10);
    await s.flush(t0);
    // The next 5-minute bucket.
    s.record('messages', 'user', 'a', 10);
    s.record('messages', 'user', 'c', 1);
    await s.flush(t0 + 301_000);
    const top = await s.top('messages', 'user', 2, t0 + 302_000);
    expect(top).toEqual([
      { id: 'a', score: 25 },
      { id: 'b', score: 20 },
    ]);
  });

  it('forgets what fell out of the window (decay)', async () => {
    if (!up) return;
    const s = make();
    const t0 = Date.UTC(2026, 9, 25, 15, 0, 0);
    s.record('upload_bytes', 'case', 'old', 100);
    await s.flush(t0);
    const later = t0 + 61 * 60_000; // window is 60 minutes
    s.record('upload_bytes', 'case', 'new', 7);
    await s.flush(later);
    const top = await s.top('upload_bytes', 'case', 20, later);
    expect(top).toEqual([{ id: 'new', score: 7 }]);
  });

  it('keeps every key under one hash tag and gives it a ttl', async () => {
    if (!up) return;
    const s = make();
    s.record('requests', 'user', 'u', 1);
    await s.flush();
    const keys = await redis.keys(`${prefix}:*`);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(k.startsWith(`${prefix}:`)).toBe(true);
      expect(await redis.ttl(k)).toBeGreaterThan(0);
    }
    expect(new HeavyHittersService(redis).prefix).toBe('{hh}');
  });

  it('bounds the sorted set to the biggest members', async () => {
    if (!up) return;
    const s = make();
    for (let i = 0; i < 700; i++) s.record('db_ms', 'user', `u${i}`, i + 1);
    await s.flush();
    const top = await s.top('db_ms', 'user', 1);
    expect(top[0]).toEqual({ id: 'u699', score: 700 });
    const key = (await redis.keys(`${prefix}:db_ms:user:*`)).find(
      (k) => !k.includes(':tmp:'),
    )!;
    expect(await redis.zcard(key)).toBeLessThanOrEqual(500);
  });

  it('is off with HEAVY_HITTERS_SAMPLE=0 and never throws when Redis fails', async () => {
    const off = new HeavyHittersService(redis, {
      get: () => 0,
    } as never);
    expect(off.enabled).toBe(false);
    expect(off.shouldSample()).toBe(false);
    const broken = new HeavyHittersService(
      {
        pipeline: () => {
          throw new Error('down');
        },
      } as never,
      { get: () => 1 } as never,
    );
    broken.record('requests', 'user', 'x', 1);
    await expect(broken.flush()).resolves.toBeUndefined();
  });
});

describe('caseIdOf', () => {
  const id = '3f0c9b1e-8a52-4c1d-9d0e-5a1f2b3c4d5e';
  it('reads :caseId and :id under /cases only', () => {
    expect(caseIdOf({ params: { caseId: id } })).toBe(id);
    expect(caseIdOf({ route: { path: '/cases/:id' }, params: { id } })).toBe(
      id,
    );
    expect(
      caseIdOf({ route: { path: '/users/:id' }, params: { id } }),
    ).toBeNull();
    expect(caseIdOf({ params: { caseId: 'not-a-uuid' } })).toBeNull();
  });
});
