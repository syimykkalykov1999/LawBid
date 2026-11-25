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
 * G5 (docs/dev/STAGE2_ARCH_PERF_2026-11-25.md): SLIDING window, Cloudflare's
 * formula ("How we built rate limiting capable of scaling to millions of
 * domains", 2017; still the Rate Limiting rules' counting). Two counters,
 * this fixed window and the previous one, and the previous one weighted by
 * the part of it still inside the sliding window:
 *   rate = prev * (window - elapsed) / window + current
 * A plain fixed window lets 2 x limit through around the boundary (limit at
 * the end of one window + limit at the start of the next); this does not.
 * Each counter lives two windows (it is the "previous" one for the next).
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
 * a second that is 1.8 M fewer Redis commands a second. The sliding window
 * stays one call (one more GET inside the script).
 * KEYS: current window hits, previous window hits, block.
 * ARGV: ttl ms, limit, blockDuration ms, ms elapsed in the current window.
 * Returns {ceil(rate), msLeftInWindow, blocked(0/1), blockTtlMs}.
 */
const THROTTLE_LUA = `
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local block = tonumber(ARGV[3])
local elapsed = tonumber(ARGV[4])
local left = ttl - elapsed
local bt = redis.call('PTTL', KEYS[3])
if bt > math.max(block, ttl) then
  redis.call('DEL', KEYS[3])
  bt = 0
end
if bt > 0 then
  return {limit + 1, left, 1, bt}
end
local cur = redis.call('INCR', KEYS[1])
if redis.call('PTTL', KEYS[1]) < 0 then
  redis.call('PEXPIRE', KEYS[1], 2 * ttl)
end
local prev = tonumber(redis.call('GET', KEYS[2]) or '0')
local rate = prev * left / ttl + cur
local hits = math.ceil(rate)
if rate > limit and block > 0 then
  redis.call('SET', KEYS[3], '1', 'PX', block)
  return {hits, left, 1, block}
end
return {hits, left, 0, 0}`;

type ThrottleCommand = (
  curKey: string,
  prevKey: string,
  blockKey: string,
  ttl: number,
  limit: number,
  block: number,
  elapsed: number,
) => Promise<[number, number, number, number]>;

/** The fixed window `now` falls in, and the ms already spent in it. */
export function slidingWindowAt(
  now: number,
  ttl: number,
): { window: number; elapsed: number } {
  const window = Math.floor(now / ttl);
  return { window, elapsed: now - window * ttl };
}

/** Cloudflare's estimate: the previous window weighted by its overlap. */
export function slidingRate(
  prev: number,
  cur: number,
  elapsed: number,
  ttl: number,
): number {
  return (prev * (ttl - elapsed)) / ttl + cur;
}

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
      // ioredis runs it by its SHA: a task of the previous release keeps
      // its own two-key script during a rolling deploy, no clash.
      r.defineCommand('lbThrottle', { numberOfKeys: 3, lua: THROTTLE_LUA });
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
    const { window, elapsed } = slidingWindowAt(Date.now(), ttl);
    const curKey = `${hitsKey}:w${window}`;
    const prevKey = `${hitsKey}:w${window - 1}`;

    const lua = this.luaCommand();
    if (lua) {
      const [hits, ttlMs, blocked, blockTtlMs] = await lua(
        curKey,
        prevKey,
        blockKey,
        ttl,
        limit,
        blockDuration,
        elapsed,
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
    const leftMs = ttl - elapsed;
    if (blockTtlMs > 0) {
      return {
        totalHits: limit + 1,
        timeToExpire: Math.ceil(leftMs / 1000),
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockTtlMs / 1000),
      };
    }

    const res = await this.redis
      .multi()
      .incr(curKey)
      .pexpire(curKey, 2 * ttl, 'NX')
      .pttl(curKey)
      .exec();
    if (!res || res.some(([err]) => err)) {
      throw res?.find(([err]) => err)?.[0] ?? new Error('MULTI aborted');
    }
    const prev = Number((await this.redis.get(prevKey)) ?? 0);
    const rate = slidingRate(prev, Number(res[0][1]), elapsed, ttl);
    const totalHits = Math.ceil(rate);
    const ttlMs = leftMs;

    let isBlocked = false;
    let timeToBlockExpire = 0;
    if (rate > limit && blockDuration > 0) {
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
