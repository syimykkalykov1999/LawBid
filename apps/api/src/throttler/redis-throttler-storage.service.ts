import { Inject, Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { ck } from '../redis/redis-cluster-safe';

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
/**
 * Load audit 6 (2026-10-23): the check used to be two round trips and six
 * Redis commands on EVERY request (PTTL block, MULTI, INCR, PEXPIRE, PTTL,
 * EXEC). One Lua call is one round trip and one command: at 300 000 requests
 * a second that is 1.8 M fewer Redis commands a second.
 * KEYS: hits, block. ARGV: ttl ms, limit, blockDuration ms.
 * Returns {hits, ttlMs, blocked(0/1), blockTtlMs}.
 */
const THROTTLE_LUA = `
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local block = tonumber(ARGV[3])
local bt = redis.call('PTTL', KEYS[2])
if bt > math.max(block, ttl) then
  redis.call('DEL', KEYS[2])
  bt = 0
end
if bt > 0 then
  return {limit + 1, redis.call('PTTL', KEYS[1]), 1, bt}
end
local hits = redis.call('INCR', KEYS[1])
if redis.call('PTTL', KEYS[1]) < 0 then
  redis.call('PEXPIRE', KEYS[1], ttl)
end
local t = redis.call('PTTL', KEYS[1])
if hits > limit and block > 0 then
  redis.call('SET', KEYS[2], '1', 'PX', block)
  return {hits, t, 1, block}
end
return {hits, t, 0, 0}`;

type ThrottleCommand = (
  hitsKey: string,
  blockKey: string,
  ttl: number,
  limit: number,
  block: number,
) => Promise<[number, number, number, number]>;

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

  /** The one-call script; undefined on a client without defineCommand
   * (the in-memory fake of the unit tests), which then takes the classic
   * multi-command path below. */
  private luaCommand(): ThrottleCommand | undefined {
    const r = this.redis as unknown as {
      defineCommand?: (n: string, d: object) => void;
      lbThrottle?: ThrottleCommand;
    };
    if (typeof r.defineCommand !== 'function') return undefined;
    if (!r.lbThrottle) {
      r.defineCommand('lbThrottle', { numberOfKeys: 2, lua: THROTTLE_LUA });
    }
    return r.lbThrottle?.bind(this.redis);
  }

  private async incrementOrThrow(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    // Cluster: both keys share the tag of the throttled subject (Lua, 2 keys).
    const tag = `thr:${throttlerName}:${key}`.replace(/[{}]/g, '');
    const hitsKey = ck(tag, `throttle:${throttlerName}:${key}`);
    const blockKey = ck(tag, `throttle-block:${throttlerName}:${key}`);

    const lua = this.luaCommand();
    if (lua) {
      const [hits, ttlMs, blocked, blockTtlMs] = await lua(
        hitsKey,
        blockKey,
        ttl,
        limit,
        blockDuration,
      );
      return {
        totalHits: Number(hits),
        timeToExpire: Math.ceil(Number(ttlMs) / 1000),
        isBlocked: Number(blocked) === 1,
        timeToBlockExpire: Math.ceil(Number(blockTtlMs) / 1000),
      };
    }

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
