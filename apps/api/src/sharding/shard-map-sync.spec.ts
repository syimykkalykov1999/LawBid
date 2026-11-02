import type Redis from 'ioredis';
import type { PrismaService } from '../prisma/prisma.service';
import { ShardMapSync } from './shard-map-sync';
import { SHARD_MAP_CHANNEL } from './shard-router';

describe('ShardMapSync.onModuleInit without Redis (load test 2026-11-02)', () => {
  it('does not wait for SUBSCRIBE (boot with Redis away must still open the port)', () => {
    const sub = {
      on: jest.fn(),
      subscribe: jest.fn(() => new Promise(() => undefined)),
      quit: jest.fn(),
    };
    const redis = { duplicate: jest.fn(() => sub) } as unknown as Redis;
    const sync = new ShardMapSync({} as unknown as PrismaService, redis);
    const started = Date.now();
    sync.onModuleInit();
    expect(Date.now() - started).toBeLessThan(100);
    expect(sub.subscribe).toHaveBeenCalledWith(SHARD_MAP_CHANNEL);
    expect(sub.on).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('without a Redis client it is a no-op', () => {
    const sync = new ShardMapSync({} as unknown as PrismaService, undefined);
    expect(() => sync.onModuleInit()).not.toThrow();
  });
});
