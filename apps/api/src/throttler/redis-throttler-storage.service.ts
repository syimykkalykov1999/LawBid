import { Inject, Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';

/**
 * docs/06_PRODUCTION.md §12 (.cursorrules) implies infra-shared state lives
 * in Redis; docs/01_FOUNDATION_AUTH.md §15 stage 1.2 explicitly calls for
 * "throttler на Redis" so rate limits are shared across API instances
 * (the in-memory default storage @nestjs/throttler ships with is
 * per-process and wrong for a horizontally scaled deployment).
 * Fixed-window counter: INCR + EXPIRE NX, no external package needed.
 */
@Injectable()
export class RedisThrottlerStorageService implements ThrottlerStorage {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitsKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `throttle-block:${throttlerName}:${key}`;

    const blockTtlMs = await this.redis.pttl(blockKey);
    if (blockTtlMs > 0) {
      return {
        totalHits: limit + 1,
        timeToExpire: Math.ceil((await this.redis.pttl(hitsKey)) / 1000),
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockTtlMs / 1000),
      };
    }

    const totalHits = await this.redis.incr(hitsKey);
    if (totalHits === 1) {
      await this.redis.pexpire(hitsKey, ttl * 1000);
    }
    const ttlMs = await this.redis.pttl(hitsKey);

    let isBlocked = false;
    let timeToBlockExpire = 0;
    if (totalHits > limit && blockDuration > 0) {
      isBlocked = true;
      timeToBlockExpire = blockDuration;
      await this.redis.set(blockKey, '1', 'PX', blockDuration * 1000);
    }

    return {
      totalHits,
      timeToExpire: Math.ceil(ttlMs / 1000),
      isBlocked,
      timeToBlockExpire,
    };
  }
}
