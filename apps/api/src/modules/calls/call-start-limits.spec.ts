/* eslint-disable @typescript-eslint/require-await -- in-memory fakes */
import { HttpException } from '@nestjs/common';
import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import type { RateLimitService } from '../auth/services/rate-limit.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import {
  type StreakRow,
  unansweredInRow,
  unansweredWaitSeconds,
} from './call-start-limits';
import { CallsService } from './calls.service';

/**
 * 26.11 (call spam): call starts per minute / per day per person, and a
 * pause after unanswered rings in a row to the same person (WhatsApp
 * Business Calling: 2 unanswered in a row = reminder, 4 = revoked). Admin
 * settings, 0 = off; admins never capped.
 */
const A = 'caller';
const B = 'callee';
const at = (minAgo: number) => new Date(Date.now() - minAgo * 60_000);
const row = (
  caller: string,
  status: string,
  minAgo: number,
  answered = false,
): StreakRow => ({
  caller_id: caller,
  status,
  answered_at: answered ? at(minAgo) : null,
  created_at: at(minAgo),
});

describe('call start limits: defaults are admin settings', () => {
  it('has sensible defaults, all editable (0 = off)', () => {
    const s = APP_SETTINGS as Record<string, unknown>;
    expect(s['calls.start_rate_limit_per_minute']).toBe(15);
    expect(s['calls.start_rate_limit_per_day']).toBe(300);
    expect(s['calls.unanswered_in_row_limit']).toBe(5);
    expect(s['calls.unanswered_cooldown_minutes']).toBe(60);
  });
});

describe('unansweredInRow', () => {
  it('counts missed, declined and canceled rings by the caller, newest first', () => {
    const r = unansweredInRow(
      [row(A, 'missed', 1), row(A, 'declined', 2), row(A, 'canceled', 3)],
      A,
    );
    expect(r.count).toBe(3);
    expect(r.lastAt?.getTime()).toBeCloseTo(at(1).getTime(), -3);
  });

  it('a call back from the other person ends the row', () => {
    expect(
      unansweredInRow([row(A, 'missed', 1), row(B, 'missed', 2)], A).count,
    ).toBe(1);
    expect(
      unansweredInRow([row(B, 'missed', 1), row(A, 'missed', 2)], A),
    ).toEqual({ count: 0, lastAt: null });
  });

  it('an answered call ends the row', () => {
    expect(
      unansweredInRow(
        [row(A, 'missed', 1), row(A, 'ended', 2, true), row(A, 'missed', 3)],
        A,
      ).count,
    ).toBe(1);
  });

  it('busy and failed starts neither count nor break the row', () => {
    expect(
      unansweredInRow(
        [row(A, 'busy', 1), row(A, 'missed', 2), row(A, 'failed', 3)],
        A,
      ).count,
    ).toBe(1);
  });
});

describe('unansweredWaitSeconds', () => {
  it('waits the rest of the cooldown from the newest unanswered ring', () => {
    const wait = unansweredWaitSeconds({ count: 5, lastAt: at(10) }, 5, 60);
    expect(wait).toBeGreaterThan(49 * 60);
    expect(wait).toBeLessThanOrEqual(50 * 60);
  });

  it('rings when the row is shorter, the cooldown is over, or it is off', () => {
    expect(unansweredWaitSeconds({ count: 4, lastAt: at(1) }, 5, 60)).toBe(0);
    expect(unansweredWaitSeconds({ count: 9, lastAt: at(61) }, 5, 60)).toBe(0);
    expect(unansweredWaitSeconds({ count: 9, lastAt: at(1) }, 0, 60)).toBe(0);
    expect(unansweredWaitSeconds({ count: 9, lastAt: at(1) }, 5, 0)).toBe(0);
  });
});

describe('UsageLimitsService.consumeSetting', () => {
  const make = (limit: number, allowed: boolean) => {
    const limiter = {
      consumeFixedWindow: jest
        .fn()
        .mockResolvedValue({ allowed, retryAfterSeconds: 7 }),
    };
    const settings = { number: jest.fn().mockResolvedValue(limit) };
    const svc = new UsageLimitsService(
      limiter as unknown as RateLimitService,
      settings as unknown as AppSettingsService,
    );
    return { svc, limiter };
  };

  it('counts in the admin-set window and answers 429 RATE_LIMITED when over', async () => {
    const { svc, limiter } = make(15, false);
    const err = await svc
      .consumeSetting(
        'call_start',
        'calls.start_rate_limit_per_minute',
        60,
        'u',
      )
      .catch((e: HttpException) => e);
    expect(limiter.consumeFixedWindow).toHaveBeenCalledWith(
      ['usage', 'call_start', 'u'],
      15,
      60,
    );
    expect((err as HttpException).getStatus()).toBe(429);
    expect((err as HttpException).getResponse()).toMatchObject({
      code: ErrorCode.RATE_LIMITED,
      details: { action: 'call_start', retryAfterSeconds: 7 },
    });
  });

  it('0 = no limit: nothing is counted', async () => {
    const { svc, limiter } = make(0, false);
    await expect(
      svc.consumeSetting(
        'call_start',
        'calls.start_rate_limit_per_minute',
        60,
        'u',
      ),
    ).resolves.toBeUndefined();
    expect(limiter.consumeFixedWindow).not.toHaveBeenCalled();
  });
});

describe('CallsService.assertCallStartLimits', () => {
  function service(rows: StreakRow[], values: Record<string, number> = {}) {
    const consumeSetting = jest.fn(async () => undefined);
    const findMany = jest.fn(async () => rows);
    const svc = Object.create(CallsService.prototype) as CallsService;
    Object.assign(svc, {
      prisma: { call: { findMany } },
      limits: { consumeSetting },
      settings: {
        number: async (k: string) =>
          values[k] ?? (APP_SETTINGS as unknown as Record<string, number>)[k],
      },
    });
    const s = svc as unknown as {
      assertCallStartLimits(u: RequestUser, conv: string): Promise<void>;
    };
    return { s, consumeSetting, findMany };
  }
  const caller = { sub: A, role: 'client' } as RequestUser;

  it('counts the start per minute and per day', async () => {
    const { s, consumeSetting } = service([]);
    await s.assertCallStartLimits(caller, 'c1');
    expect(consumeSetting).toHaveBeenCalledWith(
      'call_start',
      'calls.start_rate_limit_per_minute',
      60,
      A,
    );
    expect(consumeSetting).toHaveBeenCalledWith(
      'call_start_daily',
      'calls.start_rate_limit_per_day',
      86400,
      A,
    );
  });

  it('5 unanswered rings in a row: the 6th waits (429 call_unanswered)', async () => {
    const rows = [1, 2, 3, 4, 5].map((m) => row(A, 'missed', m));
    const { s } = service(rows);
    const err = await s
      .assertCallStartLimits(caller, 'c1')
      .catch((e: HttpException) => e);
    expect((err as HttpException).getStatus()).toBe(429);
    expect((err as HttpException).getResponse()).toMatchObject({
      code: ErrorCode.RATE_LIMITED,
      details: { action: 'call_unanswered' },
    });
  });

  it('the cooldown is over: it rings again', async () => {
    const rows = [61, 62, 63, 64, 65].map((m) => row(A, 'missed', m));
    const { s } = service(rows);
    await expect(
      s.assertCallStartLimits(caller, 'c1'),
    ).resolves.toBeUndefined();
  });

  it('the admin switched the row limit off (0): no database read', async () => {
    const rows = [1, 2, 3, 4, 5].map((m) => row(A, 'missed', m));
    const { s, findMany } = service(rows, {
      'calls.unanswered_in_row_limit': 0,
    });
    await expect(
      s.assertCallStartLimits(caller, 'c1'),
    ).resolves.toBeUndefined();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('an admin is never capped', async () => {
    const rows = [1, 2, 3, 4, 5].map((m) => row(A, 'missed', m));
    const { s, consumeSetting, findMany } = service(rows);
    await expect(
      s.assertCallStartLimits({ sub: A, role: 'admin' } as RequestUser, 'c1'),
    ).resolves.toBeUndefined();
    expect(consumeSetting).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });
});
