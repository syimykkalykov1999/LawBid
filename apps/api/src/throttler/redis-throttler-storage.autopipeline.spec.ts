import Redis from 'ioredis';
import {
  createRedisClient,
  requestPathOptions,
  waitForReady,
} from '../redis/redis-connection';
import { RedisThrottlerStorageService } from './redis-throttler-storage.service';

const URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const logger = () => ({ setContext: jest.fn(), warn: jest.fn() }) as never;

/**
 * Owner order 16.11 (speed mechanisms proof): REDIS_AUTOPIPELINE is on by
 * default. The 25.10 note said ioredis cannot pipeline the throttler's
 * defineCommand Lua, so this runs the real storage on a real Redis (dev
 * docker / CI service container) with the exact REDIS_CLIENT options, on
 * and off, from a cold script cache, many hits in one tick. Same counts and
 * the same blocks both ways. Skipped without a Redis.
 */
describe('RedisThrottlerStorageService on a real Redis, auto-pipelining on and off', () => {
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

  it.each([false, true])(
    'enableAutoPipelining=%p: 300 parallel hits, limit 100 -> 100 allowed, 200 blocked',
    async (auto) => {
      if (!up) return;
      const client = createRedisClient(URL, {
        ...requestPathOptions(1000),
        enableAutoPipelining: auto,
      });
      client.on('error', () => undefined);
      await waitForReady(client, 5_000);
      // A cold script cache: the first call must load the Lua itself.
      await client.script('FLUSH');
      const key = `autopipe-${auto}-${process.pid}-${Date.now()}`;
      const storage = new RedisThrottlerStorageService(client, logger());
      const out = await Promise.all(
        Array.from({ length: 300 }, () =>
          storage.increment(key, 60_000, 100, 5_000, 'default'),
        ),
      );
      const allowed = out.filter((r) => !r.isBlocked).length;
      const blocked = out.filter((r) => r.isBlocked).length;
      expect(allowed).toBe(100);
      expect(blocked).toBe(200);
      expect(Math.max(...out.map((r) => r.totalHits))).toBe(101);
      expect(out.every((r) => r.timeToExpire > 0)).toBe(true);
      // The keys expire by themselves (60 s window, 5 s block).
      client.disconnect();
    },
  );
});
