import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { AppConfigService } from '../../modules/feature-flags/services/app-config.service';
import { ErrorCode } from '../errors/error-code.enum';
import {
  COST_ALERT_RATIO,
  COST_WINDOW_CONFIG,
  COST_WINDOWS,
  type CostProvider,
  type CostWindow,
} from './cost-guard.constants';

// One atomic round trip for all windows of one provider.
// KEYS: n counter keys, then n warn-flag keys, then n exhausted-flag keys.
// ARGV: 1=units, 2=n, then per window i: cap, ttlSeconds, warnAt (0 = off).
//
// Phase 1 checks EVERY window before touching any counter, so a rejected
// call never increments anything (no over-increment past the cap, and a
// minute-cap rejection doesn't eat into the daily budget). Phase 2
// increments all windows. Warn/exhausted flags are SET NX with the
// window's TTL, so each alert fires exactly once per window even if the
// cap is edited mid-window.
//
// Returns {1, 0, 0, 0, v1, w1, v2, w2, ...} when admitted (v = new count,
// w = 1 if this call is the one that crossed the warn threshold), or
// {0, i, current, firstRejection} when window i would exceed its cap.
const CONSUME_LUA = `
local units = tonumber(ARGV[1])
local n = tonumber(ARGV[2])
for i = 1, n do
  local base = 2 + (i - 1) * 3
  local cap = tonumber(ARGV[base + 1])
  local cur = tonumber(redis.call('GET', KEYS[i]) or '0')
  if cur + units > cap then
    local ttl = tonumber(ARGV[base + 2])
    local first = redis.call('SET', KEYS[2 * n + i], '1', 'NX', 'EX', ttl)
    local firstFlag = 0
    if first then firstFlag = 1 end
    return {0, i, cur, firstFlag}
  end
end
local out = {1, 0, 0, 0}
for i = 1, n do
  local base = 2 + (i - 1) * 3
  local ttl = tonumber(ARGV[base + 2])
  local warnAt = tonumber(ARGV[base + 3])
  local v = redis.call('INCRBY', KEYS[i], units)
  if redis.call('TTL', KEYS[i]) < 0 then
    redis.call('EXPIRE', KEYS[i], ttl)
  end
  local w = 0
  if warnAt > 0 and v >= warnAt then
    if redis.call('SET', KEYS[n + i], '1', 'NX', 'EX', ttl) then w = 1 end
  end
  out[#out + 1] = v
  out[#out + 1] = w
end
return out
`;

export type CostCaps = Record<CostWindow, number>;

/** `budget:{sms}:d:20260927` — the `{provider}` braces are a Redis
 * Cluster hash tag, so every key of one provider lands in the same slot
 * and the multi-key Lua script above stays cluster-safe. UTC. */
export function costCounterKey(
  provider: CostProvider,
  window: CostWindow,
  at: Date,
): string {
  const iso = at.toISOString(); // 2026-09-27T13:45:12.345Z
  const yyyymm = iso.slice(0, 4) + iso.slice(5, 7);
  const yyyymmdd = yyyymm + iso.slice(8, 10);
  const stamp =
    window === 'monthly'
      ? yyyymm
      : window === 'daily'
        ? yyyymmdd
        : yyyymmdd + iso.slice(11, 13) + iso.slice(14, 16);
  return `budget:{${provider}}:${COST_WINDOW_CONFIG[window].keyTag}:${stamp}`;
}

/**
 * Global spend brake for every paid third-party call (owner-approved
 * spec extension 2026-09-27, docs/OPEN_QUESTIONS.md; operator guide in
 * docs/COST_PROTECTION.md). Per-actor limits (RateLimitService) stop one
 * number/IP/device/user; this caps the TOTAL a bot farm can make us pay
 * per minute/day/month, whatever it rotates.
 *
 * Call `consume(provider)` immediately BEFORE the provider call. It
 * either reserves the units in all windows atomically or throws
 * PROVIDER_BUDGET_EXCEEDED (503) without incrementing anything. Fails
 * CLOSED: if Redis can't be reached the call is refused — an outage of
 * the guard must never turn into unlimited spend.
 *
 * Caps: app_config `budget.<provider>.per_minute_max|daily_max|
 * monthly_max` (editable live, 30 s cache in AppConfigService), falling
 * back to BUDGET_<PROVIDER>_* env values (env.schema.ts defaults). A cap
 * of 0 disables the provider entirely.
 */
@Injectable()
export class CostGuardService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly appConfig: AppConfigService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CostGuardService.name);
  }

  async consume(provider: CostProvider, units = 1): Promise<void> {
    if (!Number.isInteger(units) || units < 1) {
      throw new Error(`CostGuardService.consume: invalid units ${units}`);
    }
    const caps = await this.resolveCaps(provider);
    const now = this.now();
    const n = COST_WINDOWS.length;
    const counterKeys = COST_WINDOWS.map((w) =>
      costCounterKey(provider, w, now),
    );
    const argv: number[] = [units, n];
    for (const w of COST_WINDOWS) {
      argv.push(
        caps[w],
        COST_WINDOW_CONFIG[w].ttlSeconds,
        this.warnAt(w, caps[w]),
      );
    }

    let raw: unknown;
    try {
      raw = await this.redis.eval(
        CONSUME_LUA,
        n * 3,
        ...counterKeys,
        ...counterKeys.map((k) => `${k}:warn`),
        ...counterKeys.map((k) => `${k}:x`),
        ...argv,
      );
    } catch (err) {
      this.logger.error(
        { err, provider, alert: 'cost_guard_unavailable' },
        'Cost guard cannot reach Redis — refusing paid call (fail closed)',
      );
      throw this.unavailable();
    }

    const result = this.parse(raw);
    if (!result) {
      this.logger.error(
        { provider, alert: 'cost_guard_unavailable' },
        'Cost guard got a malformed Redis reply — refusing paid call',
      );
      throw this.unavailable();
    }

    if (!result.allowed) {
      const window = COST_WINDOWS[result.windowIndex - 1];
      if (result.firstRejection) {
        const payload = {
          provider,
          window,
          used: result.current,
          cap: caps[window],
        };
        if (window === 'minute') {
          this.logger.warn(
            { ...payload, alert: 'cost_velocity' },
            'Paid provider per-minute velocity cap hit',
          );
        } else {
          this.logger.error(
            { ...payload, alert: 'cost_budget', stage: 'exhausted' },
            'Paid provider budget exhausted — calls are being refused',
          );
        }
      }
      throw new HttpException(
        {
          code: ErrorCode.PROVIDER_BUDGET_EXCEEDED,
          message: 'This service is temporarily unavailable. Try again later.',
          details: {
            retryAfterSeconds: this.secondsUntilWindowEnd(window, now),
          },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    COST_WINDOWS.forEach((window, i) => {
      if (result.warned[i]) {
        this.logger.warn(
          {
            provider,
            window,
            used: result.counts[i],
            cap: caps[window],
            alert: 'cost_budget',
            stage: 'threshold_80',
          },
          'Paid provider budget reached 80%',
        );
      }
    });
  }

  /** Effective caps for a provider: app_config value if it is a
   * non-negative integer, otherwise the env fallback. Never throws —
   * an unreadable app_config (DB down) degrades to the env defaults. */
  async resolveCaps(provider: CostProvider): Promise<CostCaps> {
    let stored: Record<string, unknown> = {};
    try {
      stored = await this.appConfig.getConfig();
    } catch (err) {
      this.logger.warn(
        { err, provider },
        'app_config unavailable — using env fallback cost caps',
      );
    }
    const caps = {} as CostCaps;
    for (const w of COST_WINDOWS) {
      const { configSuffix, envSuffix } = COST_WINDOW_CONFIG[w];
      const configKey = `budget.${provider}.${configSuffix}`;
      const fromDb = this.parseCap(stored[configKey]);
      if (fromDb === undefined && stored[configKey] !== undefined) {
        this.logger.warn(
          { configKey },
          'Malformed cost cap in app_config — using env fallback',
        );
      }
      caps[w] =
        fromDb ??
        this.config.getOrThrow<number>(
          `BUDGET_${provider.toUpperCase()}_${envSuffix}`,
        );
    }
    return caps;
  }

  protected now(): Date {
    return new Date();
  }

  private parseCap(value: unknown): number | undefined {
    const n =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && /^\d+$/.test(value)
          ? Number(value)
          : NaN;
    return Number.isSafeInteger(n) && n >= 0 ? n : undefined;
  }

  private warnAt(window: CostWindow, cap: number): number {
    // The per-minute window is a spike breaker, not a budget — no 80% noise.
    if (window === 'minute' || cap <= 0) return 0;
    return Math.max(1, Math.ceil(cap * COST_ALERT_RATIO));
  }

  private parse(raw: unknown):
    | {
        allowed: false;
        windowIndex: number;
        current: number;
        firstRejection: boolean;
      }
    | { allowed: true; counts: number[]; warned: boolean[] }
    | undefined {
    if (!Array.isArray(raw) || raw.length < 4) return undefined;
    const nums = raw.map((v) => Number(v));
    if (nums.some((v) => !Number.isFinite(v))) return undefined;
    if (nums[0] === 0) {
      if (nums[1] < 1 || nums[1] > COST_WINDOWS.length) return undefined;
      return {
        allowed: false,
        windowIndex: nums[1],
        current: nums[2],
        firstRejection: nums[3] === 1,
      };
    }
    if (nums.length !== 4 + COST_WINDOWS.length * 2) return undefined;
    const counts: number[] = [];
    const warned: boolean[] = [];
    for (let i = 0; i < COST_WINDOWS.length; i++) {
      counts.push(nums[4 + i * 2]);
      warned.push(nums[5 + i * 2] === 1);
    }
    return { allowed: true, counts, warned };
  }

  private unavailable(): HttpException {
    return new HttpException(
      {
        code: ErrorCode.PROVIDER_BUDGET_EXCEEDED,
        message: 'This service is temporarily unavailable. Try again later.',
        details: { retryAfterSeconds: 60 },
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  private secondsUntilWindowEnd(window: CostWindow, now: Date): number {
    const end = new Date(now.getTime());
    if (window === 'minute') {
      end.setUTCSeconds(60, 0);
    } else if (window === 'daily') {
      end.setUTCHours(24, 0, 0, 0);
    } else {
      end.setUTCMonth(end.getUTCMonth() + 1, 1);
      end.setUTCHours(0, 0, 0, 0);
    }
    return Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 1000));
  }
}
