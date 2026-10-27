import { EMAIL_DOMAIN_HOURLY_MAX, OtpService } from './otp.service';

function setup(counter: number | Error) {
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
    get: (k: string) => (k === 'NODE_ENV' ? 'production' : undefined),
  };
  const redis = {
    set: jest.fn().mockResolvedValue('OK'),
    expire: jest.fn().mockResolvedValue(1),
    incr: jest.fn(() =>
      counter instanceof Error
        ? Promise.reject(counter)
        : Promise.resolve(counter),
    ),
  };
  const email = { sendEmail: jest.fn().mockResolvedValue(undefined) };
  const costGuard = { consume: jest.fn().mockResolvedValue(undefined) };
  const service = new OtpService(
    redis as never,
    {} as never,
    email,
    config as never,
    costGuard as never,
    { getConfig: jest.fn().mockResolvedValue({}) } as never,
  );
  return { service, email, costGuard };
}

describe('OtpService e-mail domain velocity (S9-13)', () => {
  it('a throw-away domain over the hourly cap sends nothing and spends nothing', async () => {
    const { service, email, costGuard } = setup(EMAIL_DOMAIN_HOURLY_MAX + 1);
    await service.requestOtp('email', 'a@pump-me.example', 'login');
    expect(email.sendEmail).not.toHaveBeenCalled();
    expect(costGuard.consume).not.toHaveBeenCalled();
  });

  it('under the cap it sends; big providers are never counted', async () => {
    const ok = setup(3);
    await ok.service.requestOtp('email', 'a@small.example', 'login');
    expect(ok.email.sendEmail).toHaveBeenCalledTimes(1);
    const big = setup(10_000);
    await big.service.requestOtp('email', 'a@gmail.com', 'login');
    expect(big.email.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('Redis trouble lets the code through', async () => {
    const { service, email } = setup(new Error('down'));
    await service.requestOtp('email', 'a@small.example', 'login');
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
  });
});
