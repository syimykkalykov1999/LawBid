import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { closeSharedProducers, createRedisClient } from './redis-connection';
import { REDIS_CACHE_CLIENT, REDIS_CLIENT } from './redis.constants';
import { failSoftRedis } from './fail-soft-redis';

/** Cache connections this module opened (closed on shutdown). */
const cacheOwn = new Set<Redis>();

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL');
        // commandTimeout: a hung Redis fails a command in 2 s instead of
        // stalling requests (throttler fails open, cost guard fails closed).
        return createRedisClient(url as string, {
          maxRetriesPerRequest: 3,
          commandTimeout:
            config.get<number>('REDIS_COMMAND_TIMEOUT_MS') ?? 2000,
          // Same-tick commands share one round trip (REDIS_AUTOPIPELINE,
          // default on; verify in the load test, turn off to roll back).
          enableAutoPipelining:
            config.get<boolean>('REDIS_AUTOPIPELINE') ?? false,
        });
      },
    },
    {
      // Batch C item 9: a separate allkeys-lru Redis for caches when
      // REDIS_CACHE_URL is set; otherwise the same connection as above.
      // Either way a failing cache command is a miss (fail soft).
      provide: REDIS_CACHE_CLIENT,
      inject: [ConfigService, REDIS_CLIENT],
      useFactory: (config: ConfigService, main: Redis) => {
        const url = config.get<string>('REDIS_CACHE_URL');
        if (!url) return failSoftRedis(main);
        // Created through the factory like every other client. The cache
        // node is its own single standalone node (modules/redis_cache), never
        // part of the cluster, so the factory is told "not cluster mode" for
        // this one connection even when REDIS_CLUSTER=true for the main one.
        const raw = createRedisClient(
          url,
          {
            maxRetriesPerRequest: 1,
            // A cache must answer fast or be skipped.
            commandTimeout:
              config.get<number>('REDIS_CACHE_COMMAND_TIMEOUT_MS') ?? 500,
          },
          { ...process.env, REDIS_CLUSTER: 'false' },
        );
        // Without a listener a dead node would log an unhandled 'error'.
        raw.on('error', () => undefined);
        cacheOwn.add(raw);
        return failSoftRedis(raw);
      },
    },
  ],
  exports: [REDIS_CLIENT, REDIS_CACHE_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Close the connection on app.close()/SIGTERM so the process can exit
   * (graceful shutdown; also lets the serial e2e run exit — test/
   * jest-e2e.json maxWorkers: 1). Tolerates test doubles without quit(). */
  async onApplicationShutdown(): Promise<void> {
    for (const c of cacheOwn) {
      try {
        await c.quit();
      } catch {
        c.disconnect();
      }
    }
    cacheOwn.clear();
    await closeSharedProducers();
    if (typeof this.redis.quit !== 'function') return;
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}
