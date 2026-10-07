import { HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import {
  OTP_DAILY_LIMIT_MAX,
  OTP_DAILY_WINDOW_SECONDS,
  otpDailyLimit,
} from './otp-limits';
import type { RequestMeta } from './services/session.service';

const ENV: Record<string, number> = {
  OTP_RATE_LIMIT_PER_IDENTIFIER_PER_HOUR: 5,
  OTP_RATE_LIMIT_PER_IP_PER_HOUR: 10,
  OTP_RATE_LIMIT_PER_DEVICE_PER_HOUR: 10,
  OTP_RATE_LIMIT_PER_IDENTIFIER_PER_DAY: 10,
};

const allowed = { allowed: true, remaining: 1, retryAfterSeconds: 0 };

function make(
  opts: {
    stored?: unknown;
    settingsThrow?: boolean;
    noSettings?: boolean;
    daily?: { allowed: boolean; retryAfterSeconds: number };
    hourly?: { allowed: boolean; retryAfterSeconds: number };
  } = {},
) {
  const rateLimit = {
    hashIdentifier: jest.fn((v: string) => `h(${v})`),
    consumeFixedWindow: jest.fn().mockResolvedValue(allowed),
    consumeSlidingWindow: jest.fn<
      Promise<typeof allowed>,
      [string[], number, number]
    >((parts) =>
      Promise.resolve(
        parts[0] === 'otp-req-day'
          ? { remaining: 0, ...(opts.daily ?? allowed) }
          : { remaining: 0, ...(opts.hourly ?? allowed) },
      ),
    ),
  };
  const otp = { requestOtp: jest.fn().mockResolvedValue(undefined) };
  const settings = {
    storedNumber: jest.fn(() =>
      opts.settingsThrow
        ? Promise.reject(new Error('redis down'))
        : Promise.resolve(typeof opts.stored === 'number' ? opts.stored : null),
    ),
  };
  const config = {
    getOrThrow: jest.fn((k: string) => {
      if (!(k in ENV)) throw new Error(`missing ${k}`);
      return ENV[k];
    }),
  };
  const none = {} as never;
  const service = new AuthService(
    none, // prisma (unused: no fraud service)
    otp as never,
    rateLimit as never,
    none,
    none,
    none,
    none,
    { record: jest.fn().mockResolvedValue(undefined) } as never,
    none,
    none,
    config as unknown as ConfigService,
    { assertEnabled: jest.fn().mockResolvedValue(undefined) } as never,
    none,
    none,
    { assertAllowed: jest.fn().mockResolvedValue(undefined) } as never,
    none,
    undefined,
    opts.noSettings ? undefined : (settings as never),
  );
  return { service, rateLimit, otp, settings };
}

const meta = { ip: '203.0.113.7', deviceId: 'dev-1' } as RequestMeta;
const dto = { channel: 'phone', identifier: ' +15550100000 ' } as never;

const dailyCall = (rateLimit: ReturnType<typeof make>['rateLimit']) =>
  rateLimit.consumeSlidingWindow.mock.calls.find(
    (c: unknown[]) => (c[0] as string[])[0] === 'otp-req-day',
  );

describe('AuthService.requestOtp daily cap per phone / e-mail', () => {
  it('uses the env fallback (10 per rolling 24 h) on a hashed identifier key', async () => {
    const { service, rateLimit, otp } = make();
    await service.requestOtp(dto, meta);
    expect(dailyCall(rateLimit)).toEqual([
      ['otp-req-day', 'id', 'h(+15550100000)'],
      10,
      OTP_DAILY_WINDOW_SECONDS,
    ]);
    expect(otp.requestOtp).toHaveBeenCalled();
  });

  it('prefers the admin setting security.otp_per_identifier_per_day', async () => {
    const { service, rateLimit, settings } = make({ stored: 3 });
    await service.requestOtp(dto, meta);
    expect(settings.storedNumber).toHaveBeenCalledWith(
      'security.otp_per_identifier_per_day',
    );
    expect(dailyCall(rateLimit)?.[1]).toBe(3);
  });

  it('refuses with AUTH_OTP_REQUEST_LIMIT (429) past the cap and sends nothing', async () => {
    const { service, otp } = make({
      daily: { allowed: false, retryAfterSeconds: 50_000 },
    });
    const err = await service
      .requestOtp(dto, meta)
      .catch((e: HttpException) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
    expect((err as HttpException).getResponse()).toMatchObject({
      code: 'AUTH_OTP_REQUEST_LIMIT',
      details: { retryAfterSeconds: 50_000 },
    });
    expect(otp.requestOtp).not.toHaveBeenCalled();
  });

  it('does not spend the daily budget when a short limit already refused', async () => {
    const { service, rateLimit, otp } = make({
      hourly: { allowed: false, retryAfterSeconds: 600 },
    });
    await expect(service.requestOtp(dto, meta)).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(dailyCall(rateLimit)).toBeUndefined();
    expect(otp.requestOtp).not.toHaveBeenCalled();
  });

  it('keeps the cap on when settings are unreadable or absent', async () => {
    for (const opts of [{ settingsThrow: true }, { noSettings: true }]) {
      const { service, rateLimit } = make(opts);
      await service.requestOtp(dto, meta);
      expect(dailyCall(rateLimit)?.[1]).toBe(10);
    }
  });
});

describe('otpDailyLimit', () => {
  it('takes a saved whole number in range, else the env value', () => {
    expect(otpDailyLimit(25, 10)).toBe(25);
    expect(otpDailyLimit(1, 10)).toBe(1);
    expect(otpDailyLimit(OTP_DAILY_LIMIT_MAX, 10)).toBe(OTP_DAILY_LIMIT_MAX);
    expect(otpDailyLimit(null, 10)).toBe(10);
    // 0 never means unlimited (nor "block everyone"): env applies.
    expect(otpDailyLimit(0, 10)).toBe(10);
    expect(otpDailyLimit(-1, 10)).toBe(10);
    expect(otpDailyLimit(2.5, 10)).toBe(10);
    expect(otpDailyLimit(OTP_DAILY_LIMIT_MAX + 1, 10)).toBe(10);
  });
});
