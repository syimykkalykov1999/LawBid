import { HttpException } from '@nestjs/common';
import { ErrorCode } from '../errors/error-code.enum';
import { CostGuardService, costCounterKey } from './cost-guard.service';

/**
 * Unit coverage of CostGuardService's TypeScript side (cap resolution,
 * key/argv construction, reply handling, alert logging, fail-closed).
 * The Lua script's own semantics (atomic check-then-increment, no
 * over-increment past the cap, alert flags once per window) are proven
 * against a REAL Redis in test/cost-guard.e2e-spec.ts — a mocked eval
 * can't prove anything about Lua.
 */

const ENV: Record<string, number> = {
  BUDGET_SMS_PER_MINUTE_MAX: 30,
  BUDGET_SMS_DAILY_MAX: 300,
  BUDGET_SMS_MONTHLY_MAX: 5000,
  BUDGET_EMAIL_PER_MINUTE_MAX: 100,
  BUDGET_EMAIL_DAILY_MAX: 2000,
  BUDGET_EMAIL_MONTHLY_MAX: 30000,
  BUDGET_ID_CHECK_PER_MINUTE_MAX: 5,
  BUDGET_ID_CHECK_DAILY_MAX: 20,
  BUDGET_ID_CHECK_MONTHLY_MAX: 200,
};

const NOW = new Date('2026-09-27T13:45:12.000Z');

function build(opts: {
  eval?: jest.Mock;
  appConfig?: Record<string, unknown> | Error;
}) {
  const redis = {
    eval:
      opts.eval ?? jest.fn().mockResolvedValue([1, 0, 0, 0, 1, 0, 1, 0, 1, 0]),
  };
  const appConfig = {
    getConfig: jest.fn(() =>
      opts.appConfig instanceof Error
        ? Promise.reject(opts.appConfig)
        : Promise.resolve(opts.appConfig ?? {}),
    ),
  };
  const config = {
    getOrThrow: jest.fn((key: string) => {
      if (!(key in ENV)) throw new Error(`missing env ${key}`);
      return ENV[key];
    }),
  };
  const logger = {
    setContext: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  class TestGuard extends CostGuardService {
    protected now(): Date {
      return NOW;
    }
  }
  const service = new TestGuard(
    redis as never,
    appConfig as never,
    config as never,
    logger as never,
  );
  return { service, redis, logger, appConfig };
}

async function expectBudgetError(p: Promise<unknown>): Promise<HttpException> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(HttpException);
    const e = err as HttpException;
    expect(e.getStatus()).toBe(503);
    expect(e.getResponse()).toMatchObject({
      code: ErrorCode.PROVIDER_BUDGET_EXCEEDED,
    });
    return e;
  }
  throw new Error('expected PROVIDER_BUDGET_EXCEEDED');
}

describe('costCounterKey', () => {
  it('builds UTC minute/day/month keys with a cluster hash tag', () => {
    expect(costCounterKey('sms', 'minute', NOW)).toBe(
      'budget:{sms}:min:202609271345',
    );
    expect(costCounterKey('sms', 'daily', NOW)).toBe('budget:{sms}:d:20260927');
    expect(costCounterKey('email', 'monthly', NOW)).toBe(
      'budget:{email}:m:202609',
    );
  });

  it('uses UTC, not local time, at a day boundary', () => {
    const lateUtc = new Date('2026-09-30T23:59:59.000Z');
    expect(costCounterKey('sms', 'daily', lateUtc)).toBe(
      'budget:{sms}:d:20260930',
    );
    expect(costCounterKey('sms', 'monthly', lateUtc)).toBe(
      'budget:{sms}:m:202609',
    );
  });
});

describe('CostGuardService.resolveCaps', () => {
  it('prefers well-formed app_config values over env fallbacks', async () => {
    const { service } = build({
      appConfig: {
        'budget.sms.daily_max': 50,
        'budget.sms.monthly_max': '700',
      },
    });
    expect(await service.resolveCaps('sms')).toEqual({
      minute: 30,
      daily: 50,
      monthly: 700,
    });
  });

  it('falls back to env for malformed values (negative, fractional, junk) and logs it', async () => {
    const { service, logger } = build({
      appConfig: {
        'budget.sms.per_minute_max': -1,
        'budget.sms.daily_max': 1.5,
        'budget.sms.monthly_max': 'lots',
      },
    });
    expect(await service.resolveCaps('sms')).toEqual({
      minute: 30,
      daily: 300,
      monthly: 5000,
    });
    expect(logger.warn).toHaveBeenCalledTimes(3);
  });

  it('uses env caps when app_config cannot be read at all', async () => {
    const { service } = build({ appConfig: new Error('db down') });
    expect(await service.resolveCaps('id_check')).toEqual({
      minute: 5,
      daily: 20,
      monthly: 200,
    });
  });

  it('accepts 0 as a cap (provider switched off)', async () => {
    const { service } = build({ appConfig: { 'budget.email.daily_max': 0 } });
    expect((await service.resolveCaps('email')).daily).toBe(0);
  });
});

describe('CostGuardService.consume', () => {
  it('sends all three windows to Redis in one eval with caps, TTLs and 80% thresholds', async () => {
    const { service, redis } = build({});
    await service.consume('sms');

    expect(redis.eval).toHaveBeenCalledTimes(1);
    const args = redis.eval.mock.calls[0] as unknown[];
    expect(args[1]).toBe(9); // 3 counters + 3 warn flags + 3 exhausted flags
    expect(args.slice(2, 5)).toEqual([
      'budget:{sms}:min:202609271345',
      'budget:{sms}:d:20260927',
      'budget:{sms}:m:202609',
    ]);
    expect(args.slice(5, 8)).toEqual([
      'budget:{sms}:min:202609271345:warn',
      'budget:{sms}:d:20260927:warn',
      'budget:{sms}:m:202609:warn',
    ]);
    // units, n, then (cap, ttl, warnAt) per window; minute has no 80% alert.
    expect(args.slice(11)).toEqual([
      1, 3, 30, 120, 0, 300, 172800, 240, 5000, 3024000, 4000,
    ]);
  });

  it('admits silently below the 80% threshold', async () => {
    const { service, logger } = build({});
    await expect(service.consume('sms')).resolves.toBeUndefined();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs a cost_budget warn only for the window whose flag Lua just set (once per window)', async () => {
    const evalMock = jest
      .fn()
      // first call crosses the daily 80% line (Lua SET NX succeeded)
      .mockResolvedValueOnce([1, 0, 0, 0, 3, 0, 240, 1, 900, 0])
      // next call: still above 80% but flag already set -> no alert
      .mockResolvedValueOnce([1, 0, 0, 0, 4, 0, 241, 0, 901, 0]);
    const { service, logger } = build({ eval: evalMock });

    await service.consume('sms');
    await service.consume('sms');

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        alert: 'cost_budget',
        provider: 'sms',
        window: 'daily',
        used: 240,
        cap: 300,
      }),
      expect.any(String),
    );
  });

  it('rejects with 503 PROVIDER_BUDGET_EXCEEDED when a daily cap is reached, logging exhaustion once', async () => {
    const evalMock = jest
      .fn()
      .mockResolvedValueOnce([0, 2, 300, 1])
      .mockResolvedValueOnce([0, 2, 300, 0]);
    const { service, logger } = build({ eval: evalMock });

    const err = await expectBudgetError(service.consume('sms'));
    const body = err.getResponse() as {
      details: { retryAfterSeconds: number };
    };
    // 13:45:12 UTC -> next UTC midnight is 10h14m48s away
    expect(body.details.retryAfterSeconds).toBe(10 * 3600 + 14 * 60 + 48);
    await expectBudgetError(service.consume('sms'));

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        alert: 'cost_budget',
        stage: 'exhausted',
        window: 'daily',
      }),
      expect.any(String),
    );
  });

  it('treats the per-minute cap as a velocity breaker (cost_velocity warn, retry at next minute)', async () => {
    const { service, logger } = build({
      eval: jest.fn().mockResolvedValue([0, 1, 30, 1]),
    });
    const err = await expectBudgetError(service.consume('sms'));
    const body = err.getResponse() as {
      details: { retryAfterSeconds: number };
    };
    expect(body.details.retryAfterSeconds).toBe(48);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ alert: 'cost_velocity', window: 'minute' }),
      expect.any(String),
    );
  });

  it('fails CLOSED when Redis errors', async () => {
    const { service, logger } = build({
      eval: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    });
    await expectBudgetError(service.consume('email'));
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ alert: 'cost_guard_unavailable' }),
      expect.any(String),
    );
  });

  it('fails CLOSED on a malformed Redis reply', async () => {
    const { service } = build({ eval: jest.fn().mockResolvedValue('OK') });
    await expectBudgetError(service.consume('sms'));
  });

  it('rejects non-positive / fractional units before touching Redis', async () => {
    const { service, redis } = build({});
    await expect(service.consume('sms', 0)).rejects.toThrow(/invalid units/);
    await expect(service.consume('sms', 1.5)).rejects.toThrow(/invalid units/);
    expect(redis.eval).not.toHaveBeenCalled();
  });
});
