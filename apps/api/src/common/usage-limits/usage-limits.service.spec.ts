import { HttpException } from '@nestjs/common';
import { ErrorCode } from '../errors/error-code.enum';
import { APP_SETTINGS } from '../app-settings/app-settings.defaults';
import { USAGE_LIMITS, UsageLimitsService } from './usage-limits.service';
import type { AppSettingsService } from '../app-settings/app-settings.service';
import type { RateLimitService } from '../../modules/auth/services/rate-limit.service';

describe('UsageLimitsService (owner 2026-10-25 actions)', () => {
  const NEW = [
    ['bid_create', 'rate_limit.bid_create_per_day', 86400, 200],
    ['bid_counter', 'rate_limit.bid_counter_per_hour', 3600, 120],
    ['case_create', 'rate_limit.case_create_per_day', 86400, 30],
    ['chat_save', 'rate_limit.chat_save_per_minute', 60, 120],
    ['forward', 'rate_limit.forward_per_minute', 60, 60],
    ['search_suggest', 'rate_limit.search_suggest_per_minute', 60, 240],
  ] as const;

  it.each(NEW)(
    '%s: admin setting %s, window %i s, default %i',
    (a, key, win, def) => {
      expect(USAGE_LIMITS[a]).toEqual({ setting: key, windowSec: win });
      expect((APP_SETTINGS as Record<string, unknown>)[key]).toBe(def);
    },
  );

  it('consumes the admin-set limit and answers 429 RATE_LIMITED when over', async () => {
    const limiter = {
      consumeFixedWindow: jest
        .fn()
        .mockResolvedValue({ allowed: false, retryAfterSeconds: 12 }),
    };
    const settings = { number: jest.fn().mockResolvedValue(7) };
    const svc = new UsageLimitsService(
      limiter as unknown as RateLimitService,
      settings as unknown as AppSettingsService,
    );
    const err = await svc
      .consume('forward', 'u1')
      .catch((e: HttpException) => e);
    expect(limiter.consumeFixedWindow).toHaveBeenCalledWith(
      ['usage', 'forward', 'u1'],
      7,
      60,
    );
    expect((err as HttpException).getStatus()).toBe(429);
    expect((err as HttpException).getResponse()).toMatchObject({
      code: ErrorCode.RATE_LIMITED,
    });
  });
});
