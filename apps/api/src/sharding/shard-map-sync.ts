import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { PrismaService, routingOf } from '../prisma/prisma.service';
import { SHARD_MAP_CHANNEL } from './shard-router';

/**
 * Shard-ready step 3: cross-process invalidation of the `ShardRouter` cache.
 * Whoever changes `shard_map` (the future move-shard tool, step 10) calls
 * `invalidate()`: this process reloads at once and every other API / worker
 * process reloads when the Redis message arrives. The TTL (30 s) is the
 * backstop if a message is lost.
 */
@Injectable()
export class ShardMapSync implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ShardMapSync.name);
  private sub?: Redis;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.redis || typeof this.redis.duplicate !== 'function') return;
    try {
      this.sub = this.redis.duplicate();
      await this.sub.subscribe(SHARD_MAP_CHANNEL);
      this.sub.on('message', () => {
        void routingOf(this.prisma)?.router.refresh();
      });
    } catch (e) {
      this.log.warn(
        `shard_map pub/sub unavailable (TTL refresh only): ${String(e)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.sub?.quit();
    } catch {
      this.sub?.disconnect();
    }
  }

  /** Reload here now and tell every other process to reload. */
  async invalidate(): Promise<void> {
    await routingOf(this.prisma)?.router.refresh();
    if (this.redis && typeof this.redis.publish === 'function') {
      await this.redis.publish(SHARD_MAP_CHANNEL, String(Date.now()));
    }
  }
}
