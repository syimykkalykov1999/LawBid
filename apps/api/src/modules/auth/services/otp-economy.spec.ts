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
    sms as never,
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
