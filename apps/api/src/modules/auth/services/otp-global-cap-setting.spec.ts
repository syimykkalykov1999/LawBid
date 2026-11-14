import { OtpService } from './otp.service';

/** Detective R2B-9 / rule 11 (14.11): the 24-hour wrong-guess cap per
 * identifier is the admin setting `auth.otp_global_failure_cap`
 * (default 20; 0 = no cap), not a number in the code. */
function setup(cap: number | undefined) {
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
  const evalFn = jest.fn((...args: unknown[]) =>
    Promise.resolve(args.length > 0 ? ['invalid', 0] : []),
  );
  const redis = { eval: evalFn };
  const settings = {
    number: jest.fn((k: string) =>
      Promise.resolve(k === 'auth.otp_global_failure_cap' ? cap : NaN),
    ),
  };
  const service = new OtpService(
    redis as never,
    {} as never,
    {} as never,
    config as never,
    {} as never,
    { getConfig: jest.fn().mockResolvedValue({}) } as never,
    undefined,
    undefined,
    undefined,
    undefined,
    settings as never,
  );
  return { service, evalFn };
}

/** The cap is the 5th ARGV after the 5 keys (see VERIFY_LUA). */
const capArg = (call: unknown[]) => call[2 + 5 + 3];

describe('OTP global failure cap from the admin (R2B-9)', () => {
  it('uses the admin number', async () => {
    const { service, evalFn } = setup(7);
    await service.verifyOtp('phone', '+14155552680', '123456', 'login');
    expect(capArg(evalFn.mock.calls[0])).toBe(7);
  });

  it('0 = no cap', async () => {
    const { service, evalFn } = setup(0);
    await service.verifyOtp('phone', '+14155552680', '123456', 'login');
    expect(capArg(evalFn.mock.calls[0])).toBe(2_147_483_647);
  });
});
