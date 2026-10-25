import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { ErrorCode } from '../errors/error-code.enum';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { COST_ALERT_RATIO } from './cost-guard.constants';

/** Digits of the number (country code included) that make a "prefix". */
export const SMS_PREFIX_DIGITS = 6;

export type SmsAbuseVerdict = 'ok' | 'blocked';

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

  async check(
    e164: string,
    purpose: string,
    country: string | null,
    now: Date = new Date(),
  ): Promise<SmsAbuseVerdict> {
    if (purpose !== 'login' && purpose !== 'reset') return 'ok';
    try {
      const verdict = await this.velocity(e164, country);
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

    const blocked = await this.redis.exists(
      ...rules.map((r) => `sms:blk:${r.kind}:${r.id}`),
    );
    if (blocked > 0) return 'blocked';

    const windowSec = Math.max(1, windowMin) * 60;
    for (const r of rules) {
      const key = `sms:vel:${r.kind}:${r.id}`;
      const n = await this.redis.incr(key);
      if (n === 1) await this.redis.expire(key, windowSec);
      if (n <= r.max) continue;
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

  private async signupCap(now: Date): Promise<void> {
    const cap = await this.settings.number('sms.signup_daily_cap');
    if (cap <= 0) return;
    const day = now.toISOString().slice(0, 10).replace(/-/g, '');
    const key = `sms:signup:${day}`;
    const n = await this.redis.incr(key);
    if (n === 1) await this.redis.expire(key, 2 * 86_400);
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
