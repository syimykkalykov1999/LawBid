import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { AppConfigService } from '../../modules/feature-flags/services/app-config.service';
import { ErrorCode } from '../errors/error-code.enum';
import {
  COST_ALERT_RATIO,
  COST_PROVIDERS,
  DEFAULT_DAILY_BRAKE_CENTS,
  ECONOMY_DAILY_BRAKE_KEY,
  COST_WINDOW_CONFIG,
  COST_WINDOWS,
  type CostProvider,
  type CostWindow,
} from './cost-guard.constants';
import { assertNotDemo } from '../demo/demo-guards';
import {
  capMillicentsFromCalls,
  estimateMillicents,
  parsePriceBook,
  type CostEstimateInput,
  type PriceBook,
} from './cost-prices';

/** Owner 2026-10-22 (audit #4 §6): what a guarded call weighs and who
 * makes it. All optional — `consume('email')` still works. */
export interface CostOptions {
  /** The person the spend is for: their own daily money budget applies. */
  userId?: string | null;
  /** translate: characters of source text. */
  chars?: number;
  /** sms: destination country (ISO-3166 alpha-2). */
  country?: string | null;
  /** video: duration in seconds. */
  seconds?: number;
  /** An exact price in millicents (overrides the estimate). */
  millicents?: number;
}

/** `month` = one provider's MONTHLY money cap (S9-4: SMS only). */
export type MoneyScope = 'global' | 'provider' | 'user' | 'month';
const MONEY_SCOPES: MoneyScope[] = ['global', 'provider', 'user', 'month'];

// Money windows (daily, millicents) of one call, atomically: KEYS are n
// counters, n warn flags, n exhausted flags; ARGV: amount, n, then per
// counter: cap (0 = no cap), ttl, warnAt. Same two phases as CONSUME_LUA.
// Returns {1, w1..wn} or {0, i, current, firstRejection}.
const MONEY_LUA = `
local amount = tonumber(ARGV[1])
local n = tonumber(ARGV[2])
for i = 1, n do
  local base = 2 + (i - 1) * 3
  local cap = tonumber(ARGV[base + 1])
  if cap > 0 then
    local cur = tonumber(redis.call('GET', KEYS[i]) or '0')
    if cur + amount > cap then
      local ttl = tonumber(ARGV[base + 2])
      local first = redis.call('SET', KEYS[2 * n + i], '1', 'NX', 'EX', ttl)
      local f = 0
      if first then f = 1 end
      return {0, i, cur, f}
    end
  end
end
local out = {1}
for i = 1, n do
  local base = 2 + (i - 1) * 3
  local ttl = tonumber(ARGV[base + 2])
  local warnAt = tonumber(ARGV[base + 3])
  local v = redis.call('INCRBY', KEYS[i], amount)
  if redis.call('TTL', KEYS[i]) < 0 then redis.call('EXPIRE', KEYS[i], ttl) end
  local w = 0
  if warnAt > 0 and v >= warnAt then
    if redis.call('SET', KEYS[n + i], '1', 'NX', 'EX', ttl) then w = 1 end
  end
  out[#out + 1] = w
end
return out
`;

const MONEY_TTL_SEC = 2 * 86_400;
const MONEY_MONTH_TTL_SEC = 35 * 86_400;

/** `money:{m}:20261022:p:sms` — one hash tag, so the script stays
 * Redis-Cluster safe (all counters of one call in one slot). */
export function moneyCounterKey(
  scope: MoneyScope,
  at: Date,
  id: string,
): string {
  const iso = at.toISOString();
  const day = iso.slice(0, 4) + iso.slice(5, 7) + iso.slice(8, 10);
  if (scope === 'month') return `money:{m}:${day.slice(0, 6)}:pm:${id}`;
  const tag = scope === 'global' ? 'all' : scope === 'provider' ? 'p' : 'u';
  return `money:{m}:${day}:${tag}:${id}`;
}

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

  async consume(
    provider: CostProvider,
    units = 1,
    opts: CostOptions = {},
  ): Promise<void> {
    if (!Number.isInteger(units) || units < 1) {
      throw new Error(`CostGuardService.consume: invalid units ${units}`);
    }
    // Owner 2026-10-05 (demo mode): no paid provider ever works for a demo
    // account; only storage (small, quota-capped uploads) is allowed.
    if (provider !== 'storage') assertNotDemo('This service');
    const caps = await this.resolveCaps(provider);
    const now = this.now();
    // Owner 2026-10-22 (audit #4 §6): the money budgets first (global,
    // this provider, this person — daily, in cents); the call caps below
    // stay as the spike breaker. A call refused by the call caps gives
    // its money back.
    const money = await this.reserveMoney(provider, units, opts, caps, now);
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
      await this.refundMoney(money);
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

    if (provider === 'translate') await this.countTranslateChars(opts, now);
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

  /** S9-11: characters sent to Google this month — the usage reader of the
   * «Расходы» page (Google bills per character). Best effort. */
  private async countTranslateChars(
    opts: CostOptions,
    now: Date,
  ): Promise<void> {
    const chars = Math.floor(opts.chars ?? 0);
    if (chars <= 0) return;
    try {
      const key = `budget:{translate}:chars:${now.toISOString().slice(0, 7).replace('-', '')}`;
      await this.redis.incrby(key, chars);
      await this.redis.expire(key, 35 * 86_400);
    } catch {
      // a missed count only makes the spend page slightly low
    }
  }

  /** Daily money caps in millicents (0 = no cap): app_config cents, env
   * cents, else (provider) the per-call daily cap converted to money. */
  async moneyCaps(
    provider: CostProvider,
    callCaps?: CostCaps,
    storedConfig?: Record<string, unknown>,
  ): Promise<Record<MoneyScope, number>> {
    let stored: Record<string, unknown> = storedConfig ?? {};
    if (!storedConfig) {
      try {
        stored = await this.appConfig.getConfig();
      } catch {
        // env fallbacks below
      }
    }
    const cents = (key: string, env: string): number | undefined =>
      this.parseCap(stored[key]) ??
      this.parseCap(this.config.get<number | string>(env));
    const providerCents = cents(
      `budget.${provider}.daily_cents`,
      `BUDGET_${provider.toUpperCase()}_DAILY_CENTS`,
    );
    const monthCents = cents(
      `budget.${provider}.monthly_cents`,
      `BUDGET_${provider.toUpperCase()}_MONTHLY_CENTS`,
    );
    const daily = (callCaps ?? (await this.resolveCaps(provider))).daily;
    // S9-4: the admin (even 0 = none) wins, then a positive env value, then
    // the brake EconomyService derives from the allowance.
    const explicitGlobal =
      this.parseCap(stored['budget.money.global_daily_cents']) ??
      (() => {
        const e = this.parseCap(
          this.config.get<number | string>('BUDGET_GLOBAL_DAILY_CENTS'),
        );
        return e !== undefined && e > 0 ? e : undefined;
      })();
    const globalCents = explicitGlobal ?? (await this.autoDailyBrakeCents());
    return {
      global: globalCents * 1000,
      provider:
        providerCents !== undefined
          ? providerCents * 1000
          : capMillicentsFromCalls(
              provider,
              daily,
              parsePriceBook(stored).unit,
            ),
      user:
        (cents('budget.money.user_daily_cents', 'BUDGET_USER_DAILY_CENTS') ??
          0) * 1000,
      month: (monthCents ?? 0) * 1000,
    };
  }

  /** The daily brake EconomyService keeps in Redis (cents), else the
   * launch floor. Never throws. */
  private async autoDailyBrakeCents(): Promise<number> {
    try {
      const raw = await this.redis.get(ECONOMY_DAILY_BRAKE_KEY);
      const n = Number(raw);
      if (raw !== null && Number.isFinite(n) && n > 0) return Math.round(n);
    } catch {
      // floor below
    }
    return DEFAULT_DAILY_BRAKE_CENTS;
  }

  /** Today's spend in cents (global, per provider) for the admin. */
  async moneyToday(now: Date = this.now()): Promise<{
    globalCents: number;
    providers: Record<string, number>;
  }> {
    const keys = [
      moneyCounterKey('global', now, 'all'),
      ...COST_PROVIDERS.map((p) => moneyCounterKey('provider', now, p)),
    ];
    const vals = await this.redis.mget(...keys);
    const cents = (v: string | null) => Math.round(Number(v ?? 0) / 1000);
    return {
      globalCents: cents(vals[0]),
      providers: Object.fromEntries(
        COST_PROVIDERS.map((p, i) => [p, cents(vals[i + 1])]),
      ),
    };
  }

  private async reserveMoney(
    provider: CostProvider,
    units: number,
    opts: CostOptions,
    callCaps: CostCaps,
    now: Date,
  ): Promise<{ keys: string[]; amount: number } | null> {
    const input: CostEstimateInput = {
      units,
      chars: opts.chars,
      country: opts.country,
      seconds: opts.seconds,
    };
    let stored: Record<string, unknown> = {};
    try {
      stored = await this.appConfig.getConfig();
    } catch {
      // list prices + env fallbacks
    }
    const book: PriceBook = parsePriceBook(stored);
    const amount = Math.max(
      0,
      Math.round(opts.millicents ?? estimateMillicents(provider, input, book)),
    );
    if (amount === 0) return null;
    const caps = await this.moneyCaps(provider, callCaps, stored);
    const scopes = MONEY_SCOPES.filter(
      (s) =>
        (s !== 'user' || !!opts.userId) && (s !== 'month' || caps.month > 0),
    );
    const keys = scopes.map((s) =>
      moneyCounterKey(
        s,
        now,
        s === 'global'
          ? 'all'
          : s === 'provider' || s === 'month'
            ? provider
            : opts.userId!,
      ),
    );
    const argv: number[] = [amount, scopes.length];
    for (const s of scopes) {
      const cap = caps[s];
      argv.push(
        cap,
        s === 'month' ? MONEY_MONTH_TTL_SEC : MONEY_TTL_SEC,
        cap > 0 ? Math.max(1, Math.ceil(cap * COST_ALERT_RATIO)) : 0,
      );
    }
    let raw: unknown;
    try {
      raw = await this.redis.eval(
        MONEY_LUA,
        keys.length * 3,
        ...keys,
        ...keys.map((k) => `${k}:warn`),
        ...keys.map((k) => `${k}:x`),
        ...argv,
      );
    } catch (err) {
      this.logger.error(
        { err, provider, alert: 'cost_guard_unavailable' },
        'Cost guard cannot reach Redis — refusing paid call (fail closed)',
      );
      throw this.unavailable();
    }
    const out = Array.isArray(raw) ? raw.map((v) => Number(v)) : [];
    if (out[0] === 0) {
      const scope = scopes[out[1] - 1] ?? 'global';
      if (out[3] === 1) {
        this.logger.error(
          {
            provider,
            scope,
            usedCents: Math.round(out[2] / 1000),
            capCents: Math.round(caps[scope] / 1000),
            alert: 'cost_budget',
            stage: 'exhausted',
            money: true,
          },
          'Money budget used up — paid calls are being refused',
        );
      }
      throw new HttpException(
        {
          code: ErrorCode.PROVIDER_BUDGET_EXCEEDED,
          message:
            scope === 'user'
              ? 'You reached today’s limit for this service. Try again tomorrow.'
              : 'This service is temporarily unavailable. Try again later.',
          details: {
            scope,
            retryAfterSeconds: this.secondsUntilWindowEnd(
              scope === 'month' ? 'monthly' : 'daily',
              now,
            ),
          },
        },
        scope === 'user'
          ? HttpStatus.TOO_MANY_REQUESTS
          : HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (out[0] !== 1) {
      this.logger.error(
        { provider, alert: 'cost_guard_unavailable' },
        'Cost guard got a malformed Redis reply — refusing paid call',
      );
      throw this.unavailable();
    }
    scopes.forEach((scope, i) => {
      if (out[1 + i] === 1) {
        this.logger.warn(
          {
            provider,
            scope,
            capCents: Math.round(caps[scope] / 1000),
            alert: 'cost_budget',
            stage: 'threshold_80',
            money: true,
          },
          'Money budget reached 80%',
        );
      }
    });
    return { keys, amount };
  }

  private async refundMoney(
    money: { keys: string[]; amount: number } | null,
  ): Promise<void> {
    if (!money) return;
    try {
      for (const k of money.keys) await this.redis.decrby(k, money.amount);
    } catch {
      // best effort: the counter only over-counts until midnight
    }
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
