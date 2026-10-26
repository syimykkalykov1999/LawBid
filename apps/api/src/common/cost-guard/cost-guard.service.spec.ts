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
  BUDGET_TRANSLATE_PER_MINUTE_MAX: 60,
  BUDGET_TRANSLATE_DAILY_MAX: 5000,
  BUDGET_TRANSLATE_MONTHLY_MAX: 50000,
  BUDGET_IMAGE_MODERATION_PER_MINUTE_MAX: 300,
  BUDGET_IMAGE_MODERATION_DAILY_MAX: 20000,
  BUDGET_IMAGE_MODERATION_MONTHLY_MAX: 300000,
};

const NOW = new Date('2026-09-27T13:45:12.000Z');

function build(opts: {
  eval?: jest.Mock;
  moneyEval?: jest.Mock;
  appConfig?: Record<string, unknown> | Error;
  env?: Record<string, number>;
}) {
  // Owner 2026-10-22: the money budgets run first in their own script;
  // `redis.eval` below is the call-cap script these tests assert on.
  const redis = {
    eval:
      opts.eval ?? jest.fn().mockResolvedValue([1, 0, 0, 0, 1, 0, 1, 0, 1, 0]),
  };
  const moneyEval = opts.moneyEval ?? jest.fn().mockResolvedValue([1, 0, 0]);
  const decrby = jest.fn().mockResolvedValue(0);
  const wired = {
    decrby,
    eval: (script: string, ...rest: unknown[]): Promise<unknown> =>
      script.includes('local amount')
        ? (moneyEval(script, ...rest) as Promise<unknown>)
        : (redis.eval(script, ...rest) as Promise<unknown>),
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
    get: jest.fn((key: string) => opts.env?.[key]),
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
    wired as never,
    appConfig as never,
    config as never,
    logger as never,
  );
  return { service, redis, moneyEval, decrby, logger, appConfig };
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

// Owner 2026-10-22 (audit #4 §6): spend caps in money.
describe('CostGuardService money budgets', () => {
  it('reserves the estimated millicents in the global, provider and user counters', async () => {
    const { service, moneyEval } = build({
      env: { BUDGET_GLOBAL_DAILY_CENTS: 50_000, BUDGET_USER_DAILY_CENTS: 500 },
    });
    await service.consume('sms', 1, { country: 'US', userId: 'u1' });
    const args = moneyEval.mock.calls[0] as unknown[];
    expect(args[1]).toBe(9);
    expect(args.slice(2, 5)).toEqual([
      'money:{m}:20260927:all:all',
      'money:{m}:20260927:p:sms',
      'money:{m}:20260927:u:u1',
    ]);
    // amount 1150 (one US SMS), 3 counters; caps: $500, 300 SMS × 1150, $5.
    expect(args.slice(11)).toEqual([
      1150, 3, 50_000_000, 172800, 40_000_000, 345_000, 172800, 276_000,
      500_000, 172800, 400_000,
    ]);
  });

  it('prices SMS by country and translation by character', async () => {
    const { service, moneyEval } = build({});
    await service.consume('sms', 1, { country: 'KZ' });
    await service.consume('translate', 1, { chars: 1000 });
    // amount = the first ARGV after the 2 × 3 keys (no user given).
    expect((moneyEval.mock.calls[0] as unknown[])[8]).toBe(30_000);
    expect((moneyEval.mock.calls[1] as unknown[])[8]).toBe(2_000);
  });

  it('a person over their own daily cap gets 429 and nothing is spent', async () => {
    const { service, redis } = build({
      moneyEval: jest.fn().mockResolvedValue([0, 3, 499_000, 1]),
      env: { BUDGET_USER_DAILY_CENTS: 500 },
    });
    try {
      await service.consume('translate', 1, { chars: 900, userId: 'u1' });
      throw new Error('expected a refusal');
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(429);
      expect((e as HttpException).getResponse()).toMatchObject({
        code: ErrorCode.PROVIDER_BUDGET_EXCEEDED,
        details: { scope: 'user' },
      });
    }
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('the global money cap refuses with 503 and logs the exhaustion once', async () => {
    const { service, logger } = build({
      moneyEval: jest.fn().mockResolvedValue([0, 1, 49_999_000, 1]),
      env: { BUDGET_GLOBAL_DAILY_CENTS: 50_000 },
    });
    await expectBudgetError(service.consume('email'));
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        alert: 'cost_budget',
        stage: 'exhausted',
        money: true,
        scope: 'global',
      }),
      expect.any(String),
    );
  });

  it('warns at 80 % of a money cap', async () => {
    const { service, logger } = build({
      moneyEval: jest.fn().mockResolvedValue([1, 1, 0]),
      env: { BUDGET_GLOBAL_DAILY_CENTS: 100 },
    });
    await service.consume('email');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        alert: 'cost_budget',
        stage: 'threshold_80',
        money: true,
        scope: 'global',
      }),
      expect.any(String),
    );
  });

  it('a call refused by the call caps gives its money back', async () => {
    const { service, decrby } = build({
      eval: jest.fn().mockResolvedValue([0, 2, 300, 1]),
    });
    await expectBudgetError(service.consume('sms', 1, { country: 'US' }));
    expect(decrby).toHaveBeenCalledWith('money:{m}:20260927:all:all', 1150);
    expect(decrby).toHaveBeenCalledWith('money:{m}:20260927:p:sms', 1150);
  });

  it('admin cents in app_config win over env', async () => {
    const { service } = build({
      appConfig: {
        'budget.money.global_daily_cents': 1234,
        'budget.sms.daily_cents': 77,
      },
      env: { BUDGET_GLOBAL_DAILY_CENTS: 50_000 },
    });
    expect(await service.moneyCaps('sms')).toEqual({
      global: 1_234_000,
      provider: 77_000,
      user: 0,
    });
  });
});

// 2026-10-24 (abuse batch B, item 13): the daily caps of the three paid
// calls the owner watches. Rekognition (image_moderation), identity checks
// (Persona / Stripe Identity, id_check) and Google Translate (translate)
// share one mechanism: a Redis counter per UTC day, a cap editable in the
// admin card «Лимиты расходов» (app_config budget.<provider>.daily_max),
// a 503 when it is reached and one `alert: cost_budget` log line.
describe.each([
  ['image_moderation', 'BUDGET_IMAGE_MODERATION', 20000],
  ['id_check', 'BUDGET_ID_CHECK', 20],
  ['translate', 'BUDGET_TRANSLATE', 5000],
] as const)('daily cap of %s', (provider, envPrefix, envDaily) => {
  const env = {
    [`${envPrefix}_PER_MINUTE_MAX`]: 300,
    [`${envPrefix}_DAILY_MAX`]: envDaily,
    [`${envPrefix}_MONTHLY_MAX`]: 300000,
  };

  it('takes the daily cap from the admin setting first', async () => {
    const { service } = build({
      env,
      appConfig: { [`budget.${provider}.daily_max`]: 7 },
    });
    expect((await service.resolveCaps(provider)).daily).toBe(7);
  });

  it('reaching the daily cap answers 503 and logs the alert once', async () => {
    const evalMock = jest
      .fn()
      .mockResolvedValueOnce([0, 2, envDaily, 1])
      .mockResolvedValueOnce([0, 2, envDaily, 0]);
    const { service, logger } = build({
      eval: evalMock,
      appConfig: { [`budget.${provider}.daily_max`]: envDaily },
      env,
    });
    await expectBudgetError(service.consume(provider));
    await expectBudgetError(service.consume(provider));
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        provider,
        window: 'daily',
        alert: 'cost_budget',
        stage: 'exhausted',
      }),
      expect.any(String),
    );
  });

  it('the call counts against the daily window (and the money budget)', async () => {
    const { service, redis, moneyEval } = build({ env });
    await service.consume(provider);
    expect(moneyEval).toHaveBeenCalledTimes(1);
    const keys = (redis.eval.mock.calls[0] as string[]).filter(
      (a) => typeof a === 'string' && a.startsWith(`budget:{${provider}}:d:`),
    );
    expect(keys.length).toBeGreaterThan(0);
  });
});
