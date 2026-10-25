import { HttpException } from '@nestjs/common';
import { SmsAbuseGuardService } from './sms-abuse-guard.service';

/** 2026-10-24 (abuse batch B, item 10). */
describe('SmsAbuseGuardService', () => {
  let store: Map<string, number | string>;
  let settings: Record<string, number>;
  let failRedis: boolean;
  const logger = { setContext: jest.fn(), error: jest.fn(), warn: jest.fn() };

  // The handful of Redis commands the guard uses, in memory.
  const redis = {
    exists: jest.fn((...keys: string[]) => {
      if (failRedis) return Promise.reject(new Error('down'));
      return Promise.resolve(keys.filter((k) => store.has(k)).length);
    }),
    incr: jest.fn((k: string) => {
      const v = Number(store.get(k) ?? 0) + 1;
      store.set(k, v);
      return Promise.resolve(v);
    }),
    decr: jest.fn((k: string) => {
      const v = Number(store.get(k) ?? 0) - 1;
      store.set(k, v);
      return Promise.resolve(v);
    }),
    expire: jest.fn().mockResolvedValue(1),
    set: jest.fn((k: string, v: string, ...rest: unknown[]) => {
      if (rest.includes('NX') && store.has(k)) return Promise.resolve(null);
      store.set(k, v);
      return Promise.resolve('OK');
    }),
  };

  const guard = () =>
    new SmsAbuseGuardService(
      redis as never,
      { number: (k: string) => Promise.resolve(settings[k]) } as never,
      logger as never,
    );
  const US_A = '+12185516788'; // prefix 121855
  const at = new Date('2026-10-24T10:00:00Z');

  beforeEach(() => {
    store = new Map();
    failRedis = false;
    settings = {
      'sms.prefix_velocity_max': 3,
      'sms.country_velocity_max': 100,
      'sms.prefix_velocity_window_minutes': 10,
      'sms.prefix_block_minutes': 60,
      'sms.signup_daily_cap': 1000,
    };
    Object.values(redis).forEach((f) => f.mockClear());
    logger.error.mockReset();
    logger.warn.mockReset();
  });

  it('ignores purposes that are not anonymous (contact check, assistant)', async () => {
    for (const p of ['contact', 'admin', 'assistant']) {
      expect(await guard().check(US_A, p, 'US', at)).toBe('ok');
    }
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it('a synthetic burst to one prefix trips on the request after the limit', async () => {
    const g = guard();
    for (let i = 0; i < 3; i++) {
      expect(await g.check(`+1218551${6000 + i}`, 'login', 'US', at)).toBe(
        'ok',
      );
    }
    expect(await g.check('+12185519999', 'login', 'US', at)).toBe('blocked');
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        alert: 'cost_budget',
        stage: 'sms_prefix_velocity',
        kind: 'prefix',
        id: '121855',
      }),
      expect.any(String),
    );
  });

  it('a blocked prefix stays blocked without counting and without more alerts', async () => {
    const g = guard();
    for (let i = 0; i < 4; i++) await g.check(US_A, 'login', 'US', at);
    const incrCalls = redis.incr.mock.calls.length;
    expect(await g.check(US_A, 'reset', 'US', at)).toBe('blocked');
    expect(redis.incr.mock.calls.length).toBe(incrCalls);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('the block lasts sms.prefix_block_minutes and the window sms.prefix_velocity_window_minutes', async () => {
    const g = guard();
    for (let i = 0; i < 4; i++) await g.check(US_A, 'login', 'US', at);
    expect(redis.expire).toHaveBeenCalledWith('sms:vel:prefix:121855', 600);
    expect(redis.set).toHaveBeenCalledWith(
      'sms:blk:prefix:121855',
      '1',
      'EX',
      3600,
      'NX',
    );
  });

  it('another prefix of the same country is not affected', async () => {
    const g = guard();
    for (let i = 0; i < 4; i++) await g.check(US_A, 'login', 'US', at);
    expect(await g.check('+14155550100', 'login', 'US', at)).toBe('ok');
  });

  it('the country rule trips on total volume', async () => {
    settings['sms.prefix_velocity_max'] = 0;
    settings['sms.country_velocity_max'] = 2;
    const g = guard();
    expect(await g.check('+12185550001', 'login', 'US', at)).toBe('ok');
    expect(await g.check('+14155550002', 'login', 'US', at)).toBe('ok');
    expect(await g.check('+16175550003', 'login', 'US', at)).toBe('blocked');
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'country', id: 'US' }),
      expect.any(String),
    );
  });

  it('0 switches the velocity rules off', async () => {
    settings['sms.prefix_velocity_max'] = 0;
    settings['sms.country_velocity_max'] = 0;
    const g = guard();
    for (let i = 0; i < 20; i++) {
      expect(await g.check(US_A, 'login', 'US', at)).toBe('ok');
    }
  });

  describe('sign-up daily cap', () => {
    beforeEach(() => {
      settings['sms.prefix_velocity_max'] = 0;
      settings['sms.country_velocity_max'] = 0;
      settings['sms.signup_daily_cap'] = 5;
    });

    it('closes sign-up SMS at the cap: 503 PROVIDER_BUDGET_EXCEEDED with seconds to 00:00 UTC', async () => {
      const g = guard();
      for (let i = 0; i < 5; i++) await g.check(US_A, 'login', 'US', at);
      const err = (await g
        .check(US_A, 'login', 'US', at)
        .catch((e: unknown) => e)) as HttpException;
      expect(err.getStatus()).toBe(503);
      expect(err.getResponse()).toMatchObject({
        code: 'PROVIDER_BUDGET_EXCEEDED',
        details: { scope: 'signup_daily_cap', retryAfterSeconds: 14 * 3600 },
      });
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          alert: 'cost_budget',
          stage: 'exhausted',
          scope: 'signup_daily_cap',
        }),
        expect.any(String),
      );
    });

    it('the alert is logged once and a refused request gives its unit back', async () => {
      const g = guard();
      for (let i = 0; i < 5; i++) await g.check(US_A, 'login', 'US', at);
      for (let i = 0; i < 3; i++) {
        await g.check(US_A, 'login', 'US', at).catch(() => undefined);
      }
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(store.get('sms:signup:20261024')).toBe(5);
    });

    it('warns once at 80%', async () => {
      const g = guard();
      for (let i = 0; i < 5; i++) await g.check(US_A, 'login', 'US', at);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ stage: 'threshold_80' }),
        expect.any(String),
      );
    });

    it('password reset is not closed by it', async () => {
      const g = guard();
      for (let i = 0; i < 5; i++) await g.check(US_A, 'login', 'US', at);
      expect(await g.check(US_A, 'reset', 'US', at)).toBe('ok');
    });

    it('a new UTC day starts from zero', async () => {
      const g = guard();
      for (let i = 0; i < 5; i++) await g.check(US_A, 'login', 'US', at);
      const next = new Date('2026-10-25T00:00:01Z');
      expect(await g.check(US_A, 'login', 'US', next)).toBe('ok');
    });

    it('0 = no cap', async () => {
      settings['sms.signup_daily_cap'] = 0;
      const g = guard();
      for (let i = 0; i < 50; i++) {
        expect(await g.check(US_A, 'login', 'US', at)).toBe('ok');
      }
    });
  });

  it('Redis down: the code goes through (CostGuard still stands behind) and it is logged', async () => {
    failRedis = true;
    expect(await guard().check(US_A, 'login', 'US', at)).toBe('ok');
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ alert: 'sms_abuse_guard_unavailable' }),
      expect.any(String),
    );
  });
});
