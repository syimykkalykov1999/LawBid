import type Redis from 'ioredis';
import {
  CacheRedisModeService,
  cacheRedisForcedOff,
  setCacheRedisForcedOff,
  switchableRedis,
} from './cache-redis-mode';

describe('cache.redis_mode', () => {
  afterEach(() => setCacheRedisForcedOff(false));

  it('uses the cache node, and the main Redis while the switch is off', async () => {
    const cache = { get: jest.fn(() => Promise.resolve('c')) };
    const main = { get: jest.fn(() => Promise.resolve('m')) };
    const r = switchableRedis(
      cache as unknown as Redis,
      main as unknown as Redis,
    );
    expect(await r.get('k')).toBe('c');
    setCacheRedisForcedOff(true);
    expect(await r.get('k')).toBe('m');
    setCacheRedisForcedOff(false);
    expect(await r.get('k')).toBe('c');
  });

  it('reads the admin setting: off forces, on / auto do not', async () => {
    const mk = (v: string) =>
      new CacheRedisModeService({
        string: () => Promise.resolve(v),
      } as never);
    await mk('off').refresh();
    expect(cacheRedisForcedOff()).toBe(true);
    await mk('auto').refresh();
    expect(cacheRedisForcedOff()).toBe(false);
    await mk('off').refresh();
    await mk('on').refresh();
    expect(cacheRedisForcedOff()).toBe(false);
  });
});
