import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { createHash } from 'node:crypto';
import { REDIS_CLIENT } from '../../../redis/redis.constants';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

// Fixed-window: one INCR + conditional EXPIRE, atomic via EVAL.
const FIXED_WINDOW_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
if count > tonumber(ARGV[2]) then
  return {0, 0, ttl}
end
return {1, tonumber(ARGV[2]) - count, ttl}
`;

// Sliding window via a sorted set: drop entries older than the window,
// then decide admit/reject before adding — used for the per-identifier
// SMS-pumping-sensitive limit (docs/CHANGELOG.md, stage 1.4: a fixed
// window lets an attacker send 2x the hourly budget across a boundary;
// the abuse surface here is real money, so the extra cost is warranted).
const SLIDING_WINDOW_LUA = `
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2]) * 1000
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - windowMs)
local count = redis.call('ZCARD', KEYS[1])
if count >= limit then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  local retryAfter = 1
  if oldest[2] ~= nil then
    retryAfter = math.ceil((tonumber(oldest[2]) + windowMs - now) / 1000)
  end
  return {0, 0, retryAfter}
end
redis.call('ZADD', KEYS[1], now, now .. '-' .. ARGV[4])
redis.call('PEXPIRE', KEYS[1], windowMs)
return {1, limit - count - 1, math.ceil(windowMs / 1000)}
`;

/**
 * Bespoke Redis rate limiting for auth-specific limits that the existing
 * global `RedisThrottlerStorageService`/`ThrottlerGuard` (100 req/min per
 * IP, applied to every route) doesn't cover: per-identifier OTP request
 * limits, and per-IP limits for individual auth endpoints.
 *
 * Deliberately NOT built as extra named `@nestjs/throttler` throttlers:
 * the per-identifier limit must key on the *normalized* E.164 phone/
 * lowercased email, but Nest guards run before `ValidationPipe`, so a
 * `ThrottlerGuard.getTracker()` override would key on raw, unvalidated
 * `req.body.identifier` — "+1 (555) 010-0000" and "+15550100000" would
 * get separate budgets. Normalization happens in the service layer, so
 * the limit has to live there too (docs/CHANGELOG.md, stage 1.4).
 */
@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async consumeFixedWindow(
    keyParts: string[],
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const key = this.buildKey('rl:fixed', keyParts);
    const result = (await this.redis.eval(
      FIXED_WINDOW_LUA,
      1,
      key,
      windowSeconds,
      limit,
    )) as [number, number, number];
    return {
      allowed: result[0] === 1,
      remaining: result[1],
      retryAfterSeconds: result[2],
    };
  }

  async consumeSlidingWindow(
    keyParts: string[],
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const key = this.buildKey('rl:sliding', keyParts);
    const nonce = Math.random().toString(36).slice(2);
    const result = (await this.redis.eval(
      SLIDING_WINDOW_LUA,
      1,
      key,
      Date.now(),
      windowSeconds,
      limit,
      nonce,
    )) as [number, number, number];
    return {
      allowed: result[0] === 1,
      remaining: result[1],
      retryAfterSeconds: result[2],
    };
  }

  /** Identifiers are hashed before touching a Redis key — raw phone/email
   * must never appear in keyspace notifications, SLOWLOG, or MONITOR
   * output, same spirit as the existing pino redaction. */
  hashIdentifier(value: string): string {
    return createHash('sha256').update(value).digest('hex').slice(0, 32);
  }

  private buildKey(prefix: string, parts: string[]): string {
    return `${prefix}:${parts.join(':')}`;
  }
}
