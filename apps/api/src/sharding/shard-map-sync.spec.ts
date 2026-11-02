import type Redis from 'ioredis';
import type { PrismaService } from '../prisma/prisma.service';
import { fakeSubscriber } from '../redis/subscribe-in-background.spec';
import { ShardMapSync } from './shard-map-sync';
import { SHARD_MAP_CHANNEL } from './shard-router';

describe('ShardMapSync without Redis (load test 2026-11-02)', () => {
  it('onModuleInit does not wait for SUBSCRIBE (boot with Redis away must open the port); shutdown does not hang', async () => {
    const { sub } = fakeSubscriber(() => new Promise(() => undefined));
    const redis = { duplicate: jest.fn(() => sub) } as unknown as Redis;
    const sync = new ShardMapSync({} as unknown as PrismaService, redis);
    sync.onModuleInit(); // synchronous by type
    expect(sub.subscribe).toHaveBeenCalledWith(SHARD_MAP_CHANNEL);
    expect(sub.on).toHaveBeenCalledWith('message', expect.any(Function));
    await sync.onModuleDestroy();
    expect(sub.disconnect).toHaveBeenCalled();
  });

  it('without a Redis client, or with a duplicate() that throws, it is a no-op', () => {
    expect(() =>
      new ShardMapSync(
        {} as unknown as PrismaService,
        undefined,
      ).onModuleInit(),
    ).not.toThrow();
    const broken = {
      duplicate: jest.fn(() => {
        throw new Error('no duplicate');
      }),
    } as unknown as Redis;
    expect(() =>
      new ShardMapSync({} as unknown as PrismaService, broken).onModuleInit(),
    ).not.toThrow();
  });
});
