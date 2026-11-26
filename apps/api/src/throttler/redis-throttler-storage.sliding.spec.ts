import Redis from 'ioredis';
import { FakeRedis } from '../../test/support/fake-redis';
import {
  createRedisClient,
  requestPathOptions,
  waitForReady,
} from '../redis/redis-connection';
import {
  RedisThrottlerStorageService,
  slidingRate,
  slidingWindowAt,
} from './redis-throttler-storage.service';

/**
 * G5 (docs/dev/STAGE2_ARCH_PERF_2026-11-25.md): Cloudflare's sliding window
 * ("How we built rate limiting capable of scaling to millions of domains",
 * 2017): rate = prev * (window - elapsed) / window + current. A fixed window
 * lets almost 2 x limit through around the boundary; this must not.
 */
const URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const logger = () => ({ setContext: jest.fn(), warn: jest.fn() }) as never;
const WINDOW = 60_000;
const LIMIT = 10;
const BLOCK = 1_000;
/** A whole number of windows, so `T0 + x` is x ms into a window. */
const T0 = 1_000_000 * WINDOW;

/**
 * One request at the start of window W, LIMIT - 1 at its very end, then a
 * burst of LIMIT just after W + 1 began. Returns how many of the burst got
 * through. A fixed window started by the first request resets right before
 * the burst and lets all of it through (2 x LIMIT within ~1.5 s).
 */
async function boundaryBurst(
  storage: RedisThrottlerStorageService,
  key: string,
  setNow: (ms: number) => void,
): Promise<{ before: number; burstAllowed: number }> {
  setNow(T0 + 1);
  let before = 0;
  if (
    !(await storage.increment(key, WINDOW, LIMIT, BLOCK, 'default')).isBlocked
  )
    before += 1;
  setNow(T0 + WINDOW - 500);
  for (let i = 0; i < LIMIT - 1; i += 1) {
    const r = await storage.increment(key, WINDOW, LIMIT, BLOCK, 'default');
    if (!r.isBlocked) before += 1;
  }
  setNow(T0 + WINDOW + 500);
  let burstAllowed = 0;
  for (let i = 0; i < LIMIT; i += 1) {
    const r = await storage.increment(key, WINDOW, LIMIT, BLOCK, 'default');
    if (!r.isBlocked) burstAllowed += 1;
  }
  return { before, burstAllowed };
}

describe('sliding window (Cloudflare formula)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('weights the previous window by the part still inside the sliding window', () => {
    expect(slidingWindowAt(T0 + 15_000, WINDOW)).toEqual({
      window: 1_000_000,
      elapsed: 15_000,
    });
    // Cloudflare's example: 42 in the last minute, 18 so far, 15 s in.
    expect(slidingRate(42, 18, 15_000, WINDOW)).toBeCloseTo(49.5, 5);
    expect(slidingRate(10, 0, 0, WINDOW)).toBe(10);
    expect(slidingRate(10, 3, WINDOW, WINDOW)).toBe(3);
  });

  it('a burst right after the window boundary gets 429 (2 x limit never passes)', async () => {
    const redis = new FakeRedis();
    const storage = new RedisThrottlerStorageService(redis as never, logger());
    let now = T0;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const { before, burstAllowed } = await boundaryBurst(
      storage,
      'client-burst',
      (ms) => (now = ms),
    );
    expect(before).toBe(LIMIT);
    // 10 in the previous window, 59.5 s of it still inside: 9.9 + 1 > 10.
    expect(burstAllowed).toBe(0);
  });

  it('the previous window fades out: after a full quiet window the limit is whole again', async () => {
    const redis = new FakeRedis();
    const storage = new RedisThrottlerStorageService(redis as never, logger());
    let now = T0 + WINDOW - 100;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    for (let i = 0; i < LIMIT; i += 1) {
      await storage.increment('client-fade', WINDOW, LIMIT, BLOCK, 'default');
    }
    // Half of the next window gone: half of the previous 10 still counts.
    now = T0 + WINDOW + WINDOW / 2;
    let allowed = 0;
    for (let i = 0; i < LIMIT; i += 1) {
      const r = await storage.increment(
        'client-fade',
        WINDOW,
        LIMIT,
        0,
        'default',
      );
      if (r.totalHits <= LIMIT) allowed += 1;
    }
    expect(allowed).toBe(LIMIT / 2);
    // Two windows later the old counts are gone.
    now = T0 + 3 * WINDOW + 1;
    const fresh = await storage.increment(
      'client-fade',
      WINDOW,
      LIMIT,
      BLOCK,
      'default',
    );
    expect(fresh.totalHits).toBe(1);
  });
});

describe('sliding window in the one-call Lua script, on a real Redis', () => {
  let probe: Redis;
  let up = false;

  beforeAll(async () => {
    probe = new Redis(URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    probe.on('error', () => undefined);
    try {
      await probe.connect();
      await probe.ping();
      up = true;
    } catch {
      up = false;
    }
  });

  afterAll(() => probe.disconnect());
  afterEach(() => jest.restoreAllMocks());

  it('a burst right after the window boundary gets 429', async () => {
    if (!up) return;
    const client = createRedisClient(URL, requestPathOptions(1000));
    client.on('error', () => undefined);
    await waitForReady(client, 5_000);
    const storage = new RedisThrottlerStorageService(client, logger());
    let now = T0;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const key = `sliding-${process.pid}-${Math.floor(Math.random() * 1e9)}`;
    const { before, burstAllowed } = await boundaryBurst(
      storage,
      key,
      (ms) => (now = ms),
    );
    expect(before).toBe(LIMIT);
    expect(burstAllowed).toBe(0);
    client.disconnect();
  });
});
