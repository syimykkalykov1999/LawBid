import { RedisThrottlerStorageService } from './redis-throttler-storage.service';
import { FakeRedis } from '../../test/support/fake-redis';

describe('RedisThrottlerStorageService', () => {
  it('counts hits and reports not blocked while under the limit', async () => {
    const redis = new FakeRedis();
    const storage = new RedisThrottlerStorageService(redis as never);

    const first = await storage.increment('client-a', 60, 5, 120, 'default');
    const second = await storage.increment('client-a', 60, 5, 120, 'default');

    expect(first.totalHits).toBe(1);
    expect(second.totalHits).toBe(2);
    expect(second.isBlocked).toBe(false);
  });

  it('blocks once the limit is exceeded and stays blocked for blockDuration', async () => {
    const redis = new FakeRedis();
    const storage = new RedisThrottlerStorageService(redis as never);

    let last;
    for (let i = 0; i < 4; i += 1) {
      last = await storage.increment('client-b', 60, 3, 120, 'default');
    }

    expect(last.isBlocked).toBe(true);
    expect(last.timeToBlockExpire).toBe(120);

    // A subsequent call while still blocked reports isBlocked without
    // incrementing the underlying hits counter further.
    const whileBlocked = await storage.increment(
      'client-b',
      60,
      3,
      120,
      'default',
    );
    expect(whileBlocked.isBlocked).toBe(true);
  });

  it('keeps separate counters per key', async () => {
    const redis = new FakeRedis();
    const storage = new RedisThrottlerStorageService(redis as never);

    await storage.increment('client-c', 60, 5, 120, 'default');
    const other = await storage.increment('client-d', 60, 5, 120, 'default');

    expect(other.totalHits).toBe(1);
  });
});
