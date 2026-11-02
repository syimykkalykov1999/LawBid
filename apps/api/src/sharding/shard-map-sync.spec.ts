import type { PrismaService } from '../prisma/prisma.service';
import {
  brokenRedis,
  fakeSubscriber,
  redisWithSubscriber,
} from '../redis/subscribe-in-background.test-support';
import { ShardMapSync } from './shard-map-sync';
import { SHARD_MAP_CHANNEL } from './shard-router';

describe('ShardMapSync without Redis', () => {
  const prisma = {} as unknown as PrismaService;

  it('onModuleInit does not wait for SUBSCRIBE; shutdown drops the waiting client', async () => {
    const { sub } = fakeSubscriber();
    const sync = new ShardMapSync(prisma, redisWithSubscriber(sub));
    sync.onModuleInit(); // synchronous by type
    expect(sub.subscribe).toHaveBeenCalledWith(SHARD_MAP_CHANNEL);
    expect(sub.on).toHaveBeenCalledWith('message', expect.any(Function));
    await sync.onModuleDestroy();
    expect(sub.disconnect).toHaveBeenCalled();
  });

  it('without a Redis client, or with a duplicate() that throws, it is a no-op', () => {
    expect(() =>
      new ShardMapSync(prisma, undefined).onModuleInit(),
    ).not.toThrow();
    expect(() =>
      new ShardMapSync(prisma, brokenRedis()).onModuleInit(),
    ).not.toThrow();
  });
});
