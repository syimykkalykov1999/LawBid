import { Inject, Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { REDIS_CLIENT } from '../redis/redis.constants';

/**
 * docs/06_PRODUCTION.md §12 (.cursorrules) implies infra-shared state lives
 * in Redis; docs/01_FOUNDATION_AUTH.md §15 stage 1.2 explicitly calls for
 * "throttler на Redis" so rate limits are shared across API instances
 * (the in-memory default storage @nestjs/throttler ships with is
 * per-process and wrong for a horizontally scaled deployment).
 * @nestjs/throttler v6 passes `ttl`/`blockDuration` in MILLISECONDS and
 * expects `timeToExpire`/`timeToBlockExpire` back in seconds.
 * Fixed-window counter: INCR + PEXPIRE NX in one MULTI (a key can never
 * be left without an expiry), no external package needed.
 *
 * A block never outlives the blockDuration asked for now: builds before
 * 09c4f7e wrote `blockDuration * 1000` ms (60 s became ~16.7 h), and such
 * a stale key locked an admin out for hours (owner's Mac, 2026-10-05).
 * A block key with more time left than the current blockDuration is
 * dropped and the request is counted normally.
 *
 * Fails OPEN: if Redis is unreachable the request is let through with a
 * warning (alert `throttler_unavailable`) instead of turning a Redis blip
 * into a full API outage. Paid provider calls stay protected by
 * CostGuardService, which fails closed.
 */
@Injectable()
export class RedisThrottlerStorageService implements ThrottlerStorage {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RedisThrottlerStorageService.name);
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      return await this.incrementOrThrow(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    } catch (err) {
      this.logger.warn(
        {
          err,
          throttlerName,
          alert: 'throttler_unavailable',
        },
        'Throttler cannot reach Redis — allowing request (fail open)',
      );
      return {
        totalHits: 0,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }

  private async incrementOrThrow(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitsKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `throttle-block:${throttlerName}:${key}`;

    let blockTtlMs = await this.redis.pttl(blockKey);
    if (blockTtlMs > Math.max(blockDuration, ttl)) {
      await this.redis.del(blockKey);
      blockTtlMs = 0;
    }
    if (blockTtlMs > 0) {
      return {
        totalHits: limit + 1,
        timeToExpire: Math.ceil((await this.redis.pttl(hitsKey)) / 1000),
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockTtlMs / 1000),
      };
    }

    const res = await this.redis
      .multi()
      .incr(hitsKey)
      .pexpire(hitsKey, ttl, 'NX')
      .pttl(hitsKey)
      .exec();
    if (!res || res.some(([err]) => err)) {
      throw res?.find(([err]) => err)?.[0] ?? new Error('MULTI aborted');
    }
    const totalHits = Number(res[0][1]);
    const ttlMs = Number(res[2][1]);

    let isBlocked = false;
    let timeToBlockExpire = 0;
    if (totalHits > limit && blockDuration > 0) {
      isBlocked = true;
      timeToBlockExpire = Math.ceil(blockDuration / 1000);
      await this.redis.set(blockKey, '1', 'PX', blockDuration);
    }

    return {
      totalHits,
      timeToExpire: Math.ceil(ttlMs / 1000),
      isBlocked,
      timeToBlockExpire,
    };
  }
}
