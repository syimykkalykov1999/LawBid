import { HttpException } from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { OtpService } from './otp.service';

function setup(limited: boolean) {
  const config = {
    getOrThrow: (k: string) =>
      ({
        OTP_CODE_TTL_SECONDS: 300,
        OTP_MAX_ATTEMPTS: 5,
        OTP_DEV_FIXED_CODE: false,
        OTP_CODE_SECRET: 'secret-secret-secret',
        OTP_KEY_PEPPER: 'pepper-pepper-pepper',
        SMS_ALLOWED_COUNTRY_CODES: 'US',
      })[k],
    get: () => undefined,
  };
  const redis = { set: jest.fn().mockResolvedValue('OK') };
  const sms = { send: jest.fn().mockResolvedValue(undefined) };
  const costGuard = { consume: jest.fn().mockResolvedValue(undefined) };
  const service = new OtpService(
    redis as never,
    sms,
    {} as never,
    config as never,
    costGuard as never,
    { getConfig: jest.fn().mockResolvedValue({}) } as never,
    undefined,
    { isEconomyLimited: jest.fn().mockResolvedValue(limited) } as never,
  );
  return { service, sms, costGuard };
}

const PHONE = '+14155552680';

describe('OtpService SMS under the economy guard', () => {
  it.each(['contact', 'assistant'] as const)(
    'refuses a %s SMS while limited and sends nothing',
    async (purpose) => {
      const { service, sms, costGuard } = setup(true);
      const err = await service
        .requestOtp('phone', PHONE, purpose)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getResponse()).toMatchObject({
        code: ErrorCode.PROVIDER_BUDGET_EXCEEDED,
      });
      expect(sms.send).not.toHaveBeenCalled();
      expect(costGuard.consume).not.toHaveBeenCalled();
    },
  );

  it.each(['login', 'reset'] as const)(
    'still sends the %s SMS while limited',
    async (purpose) => {
      const { service, sms } = setup(true);
      await service.requestOtp('phone', PHONE, purpose);
      expect(sms.send).toHaveBeenCalledTimes(1);
    },
  );

  it('sends a contact SMS normally when not limited', async () => {
    const { service, sms } = setup(false);
    await service.requestOtp('phone', PHONE, 'contact');
    expect(sms.send).toHaveBeenCalledTimes(1);
  });
});

// 2026-10-24 (abuse batch B, item 10): the SMS-pumping guard in the OTP path.
describe('OtpService SMS abuse guard', () => {
  function withAbuse(verdict: 'ok' | 'blocked' | Error) {
    const base = setup(false);
    const check = jest.fn(() =>
      verdict instanceof Error
        ? Promise.reject(verdict)
        : Promise.resolve(verdict),
    );
    const redis = { set: jest.fn().mockResolvedValue('OK') };
    const config = {
      getOrThrow: (k: string) =>
        ({
          OTP_CODE_TTL_SECONDS: 300,
          OTP_MAX_ATTEMPTS: 5,
          OTP_DEV_FIXED_CODE: false,
          OTP_CODE_SECRET: 'secret-secret-secret',
          OTP_KEY_PEPPER: 'pepper-pepper-pepper',
          SMS_ALLOWED_COUNTRY_CODES: 'US',
        })[k],
      get: () => undefined,
    };
    const service = new OtpService(
      redis as never,
      base.sms,
      {} as never,
      config as never,
      base.costGuard as never,
      { getConfig: jest.fn().mockResolvedValue({}) } as never,
      undefined,
      undefined,
      undefined,
      { check } as never,
    );
    return { service, redis, check, sms: base.sms, costGuard: base.costGuard };
  }

  it('a blocked prefix: nothing is sent, charged or stored, and the call still succeeds', async () => {
    const { service, sms, costGuard, redis, check } = withAbuse('blocked');
    await expect(
      service.requestOtp('phone', PHONE, 'login'),
    ).resolves.toBeUndefined();
    expect(check).toHaveBeenCalledWith(PHONE, 'login', null);
    expect(sms.send).not.toHaveBeenCalled();
    expect(costGuard.consume).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('ok: the SMS goes as before', async () => {
    const { service, sms } = withAbuse('ok');
    await service.requestOtp('phone', PHONE, 'login');
    expect(sms.send).toHaveBeenCalledTimes(1);
  });

  it('the sign-up cap error reaches the caller and nothing is sent', async () => {
    const cap = new HttpException(
      { code: ErrorCode.PROVIDER_BUDGET_EXCEEDED, message: 'x' },
      503,
    );
    const { service, sms } = withAbuse(cap);
    await expect(service.requestOtp('phone', PHONE, 'login')).rejects.toBe(cap);
    expect(sms.send).not.toHaveBeenCalled();
  });

  it('e-mail codes are not looked at', async () => {
    const { service, check } = withAbuse('blocked');
    await service
      .requestOtp('email', 'a@example.com', 'login')
      .catch(() => undefined);
    expect(check).not.toHaveBeenCalled();
  });
});
