import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { ErrorCode } from '../errors/error-code.enum';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { COST_ALERT_RATIO } from './cost-guard.constants';
import { existsSafe } from '../../redis/redis-cluster-safe';

/** Digits of the number (country code included) that make a "prefix". */
export const SMS_PREFIX_DIGITS = 6;

export type SmsAbuseVerdict = 'ok' | 'blocked';

/** Days of history the burst allowance looks back on (UTC days before today). */
const BASELINE_DAYS = 7;
/** The baseline of a rule is re-read from Redis at most this often. */
const BASELINE_CACHE_MS = 10 * 60_000;
const DAY_SEC = 86_400;

const ymd = (d: Date): string => d.toISOString().slice(0, 10).replace(/-/g, '');

/**
 * 2026-10-24 (abuse batch B, item 10): the SMS-pumping brake on top of the
 * per-number limits and CostGuard. Pumping (artificially inflated traffic)
 * sends codes to many numbers of ONE premium range, so two velocity rules
 * look at where codes go, not at who asks:
 *  - prefix: more than `sms.prefix_velocity_max` codes in
 *    `sms.prefix_velocity_window_minutes` to numbers sharing the first 6
 *    digits (country code + area + start of the line);
 *  - country: the same for a whole country (`sms.country_velocity_max`).
 * A tripped prefix / country is blocked for `sms.prefix_block_minutes`:
 * nothing is sent, the caller still gets the normal «code sent» answer (an
 * attacker learns nothing), and an alert is logged once per trip with
 * `alert: cost_budget` (the CloudWatch filter that already pages).
 * Twilio's guidance is the same idea: block suspect prefixes, cap per-country
 * volume, and keep a daily budget (twilio.com/docs/verify/preventing-toll-
 * fraud, 2026).
 *
 * `sms.signup_daily_cap` is a hard cap of codes to new numbers per UTC day,
 * kept apart from «Лимиты расходов» so the auto mode never raises it; at the
 * cap, SMS sign-up is closed until 00:00 UTC (503 PROVIDER_BUDGET_EXCEEDED).
 *
 * Review R-75 (2026-10-26): fixed caps silently dropped real codes in a
 * launch or marketing spike. With `sms.cap_mode` = auto (default) every cap
 * is a FLOOR: the allowed number is max(cap, baseline x `sms.burst_multiplier`)
 * where the baseline is the highest value of the previous 7 UTC days for the
 * same rule, never above `sms.burst_ceiling_multiplier` x the cap (so an
 * attacker cannot ratchet it up, and a day's traffic only raises tomorrow's
 * baseline). Going past the cap logs `alert: sms_burst_allowance` once per
 * window / day, and 80 % of the allowed number logs the usual threshold
 * alert, so the owner sees a spike before anything is refused. `fixed` =
 * the numbers as typed, as before.
 *
 * Only anonymous purposes are looked at (`login` = sign-up, `reset`); a
 * signed-in person's own contact check is not pumping. If Redis fails the
 * request goes on (CostGuard, which fails closed, still stands behind).
 */
@Injectable()
export class SmsAbuseGuardService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly settings: AppSettingsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SmsAbuseGuardService.name);
  }

  private readonly baselineCache = new Map<
    string,
    { at: number; value: number }
  >();
  /** Highest count already stored for today per rule (skips redundant SETs). */
  private readonly peakSeen = new Map<string, number>();

  /** Highest value of `<prefix>:<day>` over the previous BASELINE_DAYS days. */
  private async baseline(prefix: string, now: Date): Promise<number> {
    const cached = this.baselineCache.get(prefix);
    if (cached && Date.now() - cached.at < BASELINE_CACHE_MS) {
      return cached.value;
    }
    const keys: string[] = [];
    for (let i = 1; i <= BASELINE_DAYS; i += 1) {
      keys.push(
        `${prefix}:${ymd(new Date(now.getTime() - i * DAY_SEC * 1000))}`,
      );
    }
    const vals = await Promise.all(keys.map((k) => this.redis.get(k)));
    const value = Math.max(0, ...vals.map((v) => Number(v ?? 0) || 0));
    this.baselineCache.set(prefix, { at: Date.now(), value });
    return value;
  }

  /** What a rule allows now: the typed cap, or more inside the burst allowance. */
  private async allowed(
    cap: number,
    prefix: string,
    now: Date,
  ): Promise<number> {
    const [mode, mult, ceilMult] = await Promise.all([
      this.settings.string('sms.cap_mode'),
      this.settings.number('sms.burst_multiplier'),
      this.settings.number('sms.burst_ceiling_multiplier'),
    ]);
    if (mode !== 'auto' || cap <= 0) return cap;
    const base = await this.baseline(prefix, now);
    const grown = Math.ceil(base * Math.max(1, mult));
    return Math.max(
      cap,
      Math.min(grown, Math.ceil(cap * Math.max(1, ceilMult))),
    );
  }

  /** Remembers today's highest count so tomorrow's baseline can use it. */
  private async recordPeak(
    prefix: string,
    n: number,
    now: Date,
  ): Promise<void> {
    const key = `${prefix}:${ymd(now)}`;
    if (n <= (this.peakSeen.get(key) ?? 0)) return;
    this.peakSeen.set(key, n);
    if (this.peakSeen.size > 5000) this.peakSeen.clear();
    await this.redis.set(key, String(n), 'EX', (BASELINE_DAYS + 2) * DAY_SEC);
  }

  async check(
    e164: string,
    purpose: string,
    country: string | null,
    now: Date = new Date(),
  ): Promise<SmsAbuseVerdict> {
    if (purpose !== 'login' && purpose !== 'reset') return 'ok';
    try {
      const verdict = await this.velocity(e164, country, now);
      if (verdict === 'blocked') return 'blocked';
      if (purpose === 'login') await this.signupCap(now);
      return 'ok';
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(
        { err, alert: 'sms_abuse_guard_unavailable' },
        'SMS abuse guard cannot reach Redis: letting the code through',
      );
      return 'ok';
    }
  }

  private async velocity(
    e164: string,
    country: string | null,
    now: Date,
  ): Promise<SmsAbuseVerdict> {
    const [prefixMax, countryMax, windowMin, blockMin] = await Promise.all([
      this.settings.number('sms.prefix_velocity_max'),
      this.settings.number('sms.country_velocity_max'),
      this.settings.number('sms.prefix_velocity_window_minutes'),
      this.settings.number('sms.prefix_block_minutes'),
    ]);
    const digits = e164.replace(/\D/g, '');
    const prefix = digits.slice(0, SMS_PREFIX_DIGITS);
    const cty = country ?? `dial${digits.slice(0, 3)}`;
    const rules = [
      { kind: 'prefix', id: prefix, max: prefixMax },
      { kind: 'country', id: cty, max: countryMax },
    ].filter((r) => r.max > 0 && r.id.length > 0);
    if (rules.length === 0) return 'ok';

    const blocked = await existsSafe(
      this.redis,
      rules.map((r) => `sms:blk:${r.kind}:${r.id}`),
    );
    if (blocked > 0) return 'blocked';

    const windowSec = Math.max(1, windowMin) * 60;
    for (const r of rules) {
      const key = `sms:vel:${r.kind}:${r.id}`;
      const n = await this.redis.incr(key);
      if (n === 1) await this.redis.expire(key, windowSec);
      const peakPrefix = `sms:velpk:${r.kind}:${r.id}`;
      const allowed = await this.allowed(r.max, peakPrefix, now);
      if (n <= allowed) {
        await this.recordPeak(peakPrefix, n, now);
        await this.velocityAlerts(r, n, allowed, windowSec);
        continue;
      }
      r.max = allowed;
      const first = await this.redis.set(
        `sms:blk:${r.kind}:${r.id}`,
        '1',
        'EX',
        Math.max(1, blockMin) * 60,
        'NX',
      );
      if (first) {
        this.logger.error(
          {
            alert: 'cost_budget',
            stage: 'sms_prefix_velocity',
            kind: r.kind,
            id: r.id,
            count: n,
            max: r.max,
            windowMinutes: windowMin,
            blockMinutes: blockMin,
          },
          'SMS pumping suspected: prefix blocked, codes are not sent',
        );
      }
      return 'blocked';
    }
    return 'ok';
  }

  /** Alerts of a rule that is still allowed: once past the typed cap (burst
   * allowance in use) and once at 80 % of the allowed number. */
  private async velocityAlerts(
    r: { kind: string; id: string; max: number },
    n: number,
    allowed: number,
    windowSec: number,
  ): Promise<void> {
    if (
      n > r.max &&
      (await this.redis.set(
        `sms:vel:burstwarn:${r.kind}:${r.id}`,
        '1',
        'EX',
        windowSec,
        'NX',
      ))
    ) {
      this.logger.warn(
        {
          alert: 'sms_burst_allowance',
          kind: r.kind,
          id: r.id,
          count: n,
          cap: r.max,
          allowed,
        },
        'SMS volume passed the typed cap: burst allowance (7-day baseline x multiplier) is in use',
      );
    }
    const warnAt = Math.max(1, Math.ceil(allowed * COST_ALERT_RATIO));
    if (
      n >= warnAt &&
      (await this.redis.set(
        `sms:vel:warn:${r.kind}:${r.id}`,
        '1',
        'EX',
        windowSec,
        'NX',
      ))
    ) {
      this.logger.warn(
        {
          alert: 'cost_budget',
          stage: 'threshold_80',
          provider: 'sms',
          scope: `velocity_${r.kind}`,
          id: r.id,
          used: n,
          cap: allowed,
        },
        'SMS volume to one prefix / country reached 80% of what is allowed',
      );
    }
  }

  private async signupCap(now: Date): Promise<void> {
    const typedCap = await this.settings.number('sms.signup_daily_cap');
    if (typedCap <= 0) return;
    const day = ymd(now);
    const key = `sms:signup:${day}`;
    // Burst allowance: the cap is a floor (see the class comment).
    const cap = await this.allowed(typedCap, 'sms:signup', now);
    const n = await this.redis.incr(key);
    if (n === 1) await this.redis.expire(key, (BASELINE_DAYS + 2) * DAY_SEC);
    if (
      n > typedCap &&
      n <= cap &&
      (await this.redis.set(`${key}:burst`, '1', 'EX', 2 * DAY_SEC, 'NX'))
    ) {
      this.logger.warn(
        {
          alert: 'sms_burst_allowance',
          provider: 'sms',
          scope: 'signup_daily_cap',
          used: n,
          cap: typedCap,
          allowed: cap,
        },
        'SMS sign-up codes passed the typed daily cap: burst allowance (7-day baseline x multiplier) is in use',
      );
    }
    const warnAt = Math.max(1, Math.ceil(cap * COST_ALERT_RATIO));
    if (n <= cap) {
      if (
        n >= warnAt &&
        (await this.redis.set(`${key}:warn`, '1', 'EX', 2 * 86_400, 'NX'))
      ) {
        this.logger.warn(
          {
            alert: 'cost_budget',
            stage: 'threshold_80',
            provider: 'sms',
            scope: 'signup_daily_cap',
            used: n,
            cap,
          },
          'SMS sign-up codes reached 80% of the daily cap',
        );
      }
      return;
    }
    await this.redis.decr(key).catch(() => undefined);
    if (await this.redis.set(`${key}:x`, '1', 'EX', 2 * 86_400, 'NX')) {
      this.logger.error(
        {
          alert: 'cost_budget',
          stage: 'exhausted',
          provider: 'sms',
          scope: 'signup_daily_cap',
          used: n - 1,
          cap,
        },
        'SMS sign-up daily cap reached: sign-up by SMS is closed until 00:00 UTC',
      );
    }
    const end = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
    );
    throw new HttpException(
      {
        code: ErrorCode.PROVIDER_BUDGET_EXCEEDED,
        message: 'This service is temporarily unavailable. Try again later.',
        details: {
          scope: 'signup_daily_cap',
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((end - now.getTime()) / 1000),
          ),
        },
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
