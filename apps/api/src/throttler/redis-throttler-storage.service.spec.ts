import { RedisThrottlerStorageService } from './redis-throttler-storage.service';
import { FakeRedis } from '../../test/support/fake-redis';

const logger = () => ({ setContext: jest.fn(), warn: jest.fn() }) as never;

describe('RedisThrottlerStorageService', () => {
  it('counts hits and reports not blocked while under the limit', async () => {
    const redis = new FakeRedis();
    const storage = new RedisThrottlerStorageService(redis as never, logger());

    const first = await storage.increment(
      'client-a',
      60_000,
      5,
      120_000,
      'default',
    );
    const second = await storage.increment(
      'client-a',
      60_000,
      5,
      120_000,
      'default',
    );

    expect(first.totalHits).toBe(1);
    expect(second.totalHits).toBe(2);
    expect(second.isBlocked).toBe(false);
  });

  it('blocks once the limit is exceeded and stays blocked for blockDuration', async () => {
    const redis = new FakeRedis();
    const storage = new RedisThrottlerStorageService(redis as never, logger());

    let last: Awaited<ReturnType<typeof storage.increment>> | undefined;
    for (let i = 0; i < 4; i += 1) {
      last = await storage.increment('client-b', 60_000, 3, 120_000, 'default');
    }

    // The loop above always runs (4 iterations), so `last` is always assigned.
    expect(last!.isBlocked).toBe(true);
    expect(last!.timeToBlockExpire).toBe(120);

    // A subsequent call while still blocked reports isBlocked without
    // incrementing the underlying hits counter further.
    const whileBlocked = await storage.increment(
      'client-b',
      60_000,
      3,
      120_000,
      'default',
    );
    expect(whileBlocked.isBlocked).toBe(true);
  });

  it('keeps separate counters per key', async () => {
    const redis = new FakeRedis();
    const storage = new RedisThrottlerStorageService(redis as never, logger());

    await storage.increment('client-c', 60_000, 5, 120_000, 'default');
    const other = await storage.increment(
      'client-d',
      60_000,
      5,
      120_000,
      'default',
    );

    expect(other.totalHits).toBe(1);
  });

  it('expires the window after ttl milliseconds (v6 passes ms)', async () => {
    const redis = new FakeRedis();
    const storage = new RedisThrottlerStorageService(redis as never, logger());
    // At the start of a window (the counters are aligned to whole windows).
    const window = 28_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(window * 60_000);

    const rec = await storage.increment('client-e', 60_000, 5, 0, 'default');

    expect(rec.timeToExpire).toBe(60);
    // G5 sliding window: a window's counter is the "previous" one of the
    // next window, so it lives two windows.
    const ttl = await redis.pttl(`throttle:default:client-e:w${window}`);
    expect(ttl).toBeLessThanOrEqual(120_000);
    expect(ttl).toBeGreaterThan(60_000);
    jest.restoreAllMocks();
  });

  it('drops a stale block longer than the current blockDuration', async () => {
    const redis = new FakeRedis();
    const storage = new RedisThrottlerStorageService(redis as never, logger());
    // Left by builds that wrote blockDuration * 1000 ms (~16.7 h).
    await redis.set('throttle-block:default:admin-x', '1', 'PX', 60_000_000);

    const rec = await storage.increment('admin-x', 60_000, 5, 5_000, 'default');

    expect(rec.isBlocked).toBe(false);
    expect(rec.totalHits).toBe(1);
    expect(await redis.pttl('throttle-block:default:admin-x')).toBeLessThan(0);
  });

  it('a short block ends after blockDuration, not hours later', async () => {
    const redis = new FakeRedis();
    const storage = new RedisThrottlerStorageService(redis as never, logger());

    let last: Awaited<ReturnType<typeof storage.increment>> | undefined;
    for (let i = 0; i < 3; i += 1) {
      last = await storage.increment('admin-y', 60_000, 2, 5_000, 'default');
    }

    expect(last!.isBlocked).toBe(true);
    expect(last!.timeToBlockExpire).toBe(5);
    expect(
      await redis.pttl('throttle-block:default:admin-y'),
    ).toBeLessThanOrEqual(5_000);
  });

  it('Redis errors: the request is counted in memory (R2) with a throttler_unavailable warning', async () => {
    const down = new Error('ECONNREFUSED');
    const redis = {
      pttl: jest.fn().mockRejectedValue(down),
      multi: jest.fn(),
    };
    const log = { setContext: jest.fn(), warn: jest.fn() };
    const storage = new RedisThrottlerStorageService(
      redis as never,
      log as never,
    );

    const rec = await storage.increment(
      'client-f',
      60_000,
      5,
      60_000,
      'default',
    );

    expect(rec.isBlocked).toBe(false);
    expect(rec.totalHits).toBe(1);
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: down, alert: 'throttler_unavailable' }),
      expect.any(String),
    );
    storage.onApplicationShutdown();
  });

  // THIRD_PASS_A R2 (26.11): before, a Redis outage let every request
  // through (totalHits 0), so login / OTP had no brute-force limit at all.
  it('Redis down: a brute force on one key is still blocked by the per-task limit; other keys are not', async () => {
    const redis = {
      pttl: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      multi: jest.fn(),
    };
    const storage = new RedisThrottlerStorageService(redis as never, logger());
    const otp = () =>
      storage.increment('ip:203.0.113.9', 60_000, 5, 60_000, 'auth');
    for (let i = 0; i < 5; i += 1) {
      expect((await otp()).isBlocked).toBe(false);
    }
    const sixth = await otp();
    expect(sixth.isBlocked).toBe(true);
    expect(sixth.totalHits).toBeGreaterThan(5);
    expect(sixth.timeToBlockExpire).toBeGreaterThan(0);
    // A different person is not affected.
    const other = await storage.increment(
      'ip:198.51.100.7',
      60_000,
      5,
      60_000,
      'auth',
    );
    expect(other).toMatchObject({ isBlocked: false, totalHits: 1 });
    storage.onApplicationShutdown();
  });

  it('a MULTI reply with a command error falls back to the in-memory count', async () => {
    const redis = {
      pttl: jest.fn().mockResolvedValue(-2),
      multi: () => {
        const chain = {
          incr: () => chain,
          pexpire: () => chain,
          pttl: () => chain,
          exec: () =>
            Promise.resolve([
              [new Error('OOM'), null],
              [null, 1],
              [null, 60_000],
            ]),
        };
        return chain;
      },
    };
    const log = { setContext: jest.fn(), warn: jest.fn() };
    const storage = new RedisThrottlerStorageService(
      redis as never,
      log as never,
    );

    const rec = await storage.increment(
      'client-g',
      60_000,
      5,
      60_000,
      'default',
    );

    expect(rec.isBlocked).toBe(false);
    expect(rec.totalHits).toBe(1);
    expect(log.warn).toHaveBeenCalledTimes(1);
    storage.onApplicationShutdown();
  });
});
