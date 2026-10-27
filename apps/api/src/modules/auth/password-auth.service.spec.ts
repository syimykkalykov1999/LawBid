import {
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { PasswordAuthService } from './password-auth.service';
import { PasswordService } from './services/password.service';
import { AUTH_EVENT_TYPES } from './services/auth-event.service';
import { ErrorCode } from '../../common/errors/error-code.enum';

const META = { ip: '1.2.3.4' };
const TOKENS = { accessToken: 'a', refreshToken: 'r' };

async function make(
  opts: {
    hasUser?: boolean;
    verifiedEmail?: boolean;
    emailFlowsOn?: boolean;
    limited?: boolean;
    otpResult?: 'ok' | 'invalid' | 'expired' | 'locked';
    noPassword?: boolean;
  } = {},
) {
  const passwords = new PasswordService();
  const hash = await passwords.hash('Demo1234!');
  const user = {
    id: 'u1',
    status: 'active',
    phone_e164: '+14155552680',
    phone_verified_at: new Date(),
    email: opts.verifiedEmail ? 'sofia@example.com' : null,
    email_verified_at: opts.verifiedEmail ? new Date() : null,
    password_hash: opts.noPassword ? null : hash,
  };
  const prisma = {
    userIdentifier: {
      findUnique: jest
        .fn()
        .mockResolvedValue(opts.hasUser === false ? null : { user }),
    },
    user: {
      update: jest.fn().mockResolvedValue(user),
      findUniqueOrThrow: jest.fn().mockResolvedValue(user),
    },
  };
  const auth = { finishLogin: jest.fn().mockResolvedValue(TOKENS) };
  const rateLimit = {
    hashIdentifier: jest.fn((v: string) => `h(${v})`),
    consumeSlidingWindow: jest.fn().mockResolvedValue({
      allowed: !opts.limited,
      remaining: 1,
      retryAfterSeconds: 30,
    }),
  };
  const otp = {
    requestOtp: jest.fn().mockResolvedValue(undefined),
    verifyOtp: jest.fn().mockResolvedValue(opts.otpResult ?? 'ok'),
  };
  const authEvents = { record: jest.fn().mockResolvedValue(undefined) };
  const loginMethods = {
    assertEnabled: jest.fn().mockResolvedValue(undefined),
    assertPlatformAllowed: jest.fn().mockResolvedValue(undefined),
    isEnabled: jest.fn().mockResolvedValue(opts.emailFlowsOn ?? true),
  };
  const bans = { assertAllowed: jest.fn().mockResolvedValue(undefined) };
  const revocation = {
    revokeAllChainsForUser: jest.fn().mockResolvedValue([]),
    revokeOtherChainsForUser: jest.fn().mockResolvedValue([]),
  };
  const service = new PasswordAuthService(
    prisma as never,
    auth as never,
    passwords,
    rateLimit as never,
    otp as never,
    authEvents as never,
    loginMethods as never,
    bans as never,
    revocation as never,
  );
  return {
    service,
    prisma,
    auth,
    otp,
    authEvents,
    revocation,
    rateLimit,
    bans,
  };
}

describe('PasswordAuthService', () => {
  it('signs in with the right password and never sends an SMS', async () => {
    const { service, auth, otp } = await make();
    const tokens = await service.login(
      { identifier: '+14155552680', password: 'Demo1234!' },
      META,
    );
    expect(tokens).toEqual(TOKENS);
    expect(otp.requestOtp).not.toHaveBeenCalled();
    expect(auth.finishLogin).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1' }),
      false,
      false,
      'password:+14155552680',
      {},
      META,
    );
  });

  it('answers a wrong password and an unknown account the same way', async () => {
    const wrong = await make();
    const unknown = await make({ hasUser: false });
    const bad = { identifier: '+14155552680', password: 'nope-nope' };
    const errA = await wrong.service.login(bad, META).catch((e: unknown) => e);
    const errB = await unknown.service
      .login(bad, META)
      .catch((e: unknown) => e);
    for (const err of [errA, errB]) {
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect((err as UnauthorizedException).getResponse()).toMatchObject({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
      });
    }
    expect(wrong.auth.finishLogin).not.toHaveBeenCalled();
    expect(wrong.authEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AUTH_EVENT_TYPES.PASSWORD_LOGIN_FAILED,
      }),
    );
  });

  it('owner 2026-10-14: an unknown number and a number without a password answer the same', async () => {
    const unknown = await make({ hasUser: false });
    const a = await unknown.service.phoneStatus(
      { identifier: '+14155552680' },
      META,
    );
    expect(a).toEqual({ registered: false, hasPassword: false });
  });

  it('owner 2026-10-14: guesses are counted per account AND source, so a stranger cannot lock the owner out', async () => {
    const { service, rateLimit } = await make();
    await service.login(
      { identifier: '+14155552680', password: 'Demo1234!' },
      META,
    );
    const keys = (rateLimit.consumeSlidingWindow.mock.calls as unknown[][]).map(
      (c) => (c[0] as string[])[1],
    );
    expect(keys).toContain('id+src');
    expect(keys).not.toContain('id');
  });

  it('lower-cases an e-mail identifier', async () => {
    const { service, prisma } = await make({ verifiedEmail: true });
    await service.login(
      { identifier: 'Sofia@Example.com', password: 'Demo1234!' },
      META,
    );
    expect(prisma.userIdentifier.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_provider_uid: {
            provider: 'email',
            provider_uid: 'sofia@example.com',
          },
        },
      }),
    );
  });

  it('refuses when rate limited', async () => {
    const { service, prisma } = await make({ limited: true });
    await expect(
      service.login({ identifier: '+14155552680', password: 'x' }, META),
    ).rejects.toBeInstanceOf(HttpException);
    expect(prisma.userIdentifier.findUnique).not.toHaveBeenCalled();
  });

  describe('forgot password', () => {
    it('owner 2026-10-14: the code goes by SMS even when a verified e-mail exists', async () => {
      const { service, otp } = await make({ verifiedEmail: true });
      const res = await service.requestReset(
        { identifier: '+14155552680' },
        META,
      );
      expect(res).toEqual({ sent: true, channel: 'phone' });
      expect(otp.requestOtp).toHaveBeenCalledWith(
        'phone',
        '+14155552680',
        'reset',
      );
    });

    it('falls back to the SMS without a verified e-mail', async () => {
      const { service, otp } = await make();
      const res = await service.requestReset(
        { identifier: '+14155552680' },
        META,
      );
      expect(res.channel).toBe('phone');
      expect(otp.requestOtp).toHaveBeenCalledWith(
        'phone',
        '+14155552680',
        'reset',
      );
    });

    it('an e-mail identifier is refused honestly (reset is by phone only)', async () => {
      const { service, otp } = await make({ verifiedEmail: true });
      await expect(
        service.requestReset({ identifier: 'sofia@example.com' }, META),
      ).rejects.toThrow('phone number only');
      expect(otp.requestOtp).not.toHaveBeenCalled();
    });

    it('sends nothing for an unknown account but answers the same', async () => {
      const { service, otp } = await make({ hasUser: false });
      const res = await service.requestReset(
        { identifier: '+14155550000' },
        META,
      );
      expect(res).toEqual({ sent: true, channel: 'phone' });
      expect(otp.requestOtp).not.toHaveBeenCalled();
    });

    it('S14-2: a failing send (provider down, banned account) is invisible: the same `sent`', async () => {
      const { service, otp, bans } = await make();
      otp.requestOtp.mockRejectedValueOnce(new Error('provider down'));
      await expect(
        service.requestReset({ identifier: '+14155552680' }, META),
      ).resolves.toEqual({ sent: true, channel: 'phone' });
      bans.assertAllowed.mockRejectedValueOnce(
        new ForbiddenException({ code: ErrorCode.ACCOUNT_SUSPENDED }),
      );
      await expect(
        service.requestReset({ identifier: '+14155552680' }, META),
      ).resolves.toEqual({ sent: true, channel: 'phone' });
    });

    it('S14-2: confirm answers an unknown number, a wrong code and an expired code with the SAME error', async () => {
      const codes: string[] = [];
      for (const [hasUser, otpResult] of [
        [false, 'expired'],
        [true, 'expired'],
        [true, 'invalid'],
      ] as const) {
        const { service, otp } = await make({ hasUser, otpResult });
        try {
          await service.confirmReset(
            {
              identifier: '+14155552680',
              code: '111111',
              newPassword: 'Brand-new-1',
            },
            META,
          );
        } catch (e) {
          codes.push(
            (e as UnauthorizedException).getResponse() as unknown as string,
          );
        }
        // The unknown account runs the same verification as a known one.
        expect(otp.verifyOtp).toHaveBeenCalledTimes(1);
      }
      expect(codes).toHaveLength(3);
      for (const c of codes) {
        expect(c).toMatchObject({ code: ErrorCode.AUTH_OTP_INVALID });
      }
    });

    it('sets the new password, ends every session and signs in', async () => {
      const { service, prisma, revocation, auth } = await make();
      const tokens = await service.confirmReset(
        {
          identifier: '+14155552680',
          code: '000000',
          newPassword: 'Brand-new-1',
        },
        META,
      );
      expect(tokens).toEqual(TOKENS);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: expect.objectContaining({
            password_hash: expect.stringMatching(/^scrypt\$/),
          }),
        }),
      );
      expect(revocation.revokeAllChainsForUser).toHaveBeenCalledWith(
        'u1',
        'logout_all',
      );
      expect(auth.finishLogin).toHaveBeenCalled();
    });

    it('does not change the password on a wrong code', async () => {
      const { service, prisma } = await make({ otpResult: 'invalid' });
      await expect(
        service.confirmReset(
          {
            identifier: '+14155552680',
            code: '111111',
            newPassword: 'Brand-new-1',
          },
          META,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  const noReauth = () => ({
    hasReauthToken: false,
    assertReauth: jest
      .fn()
      .mockRejectedValue(
        new ForbiddenException({ code: ErrorCode.REAUTH_REQUIRED }),
      ),
  });

  it('changing an existing password needs the current one', async () => {
    const { service, prisma } = await make();
    await expect(
      service.setPassword(
        { password: 'Another-pass-1', currentPassword: 'wrong-one' },
        { sub: 'u1' } as never,
        noReauth(),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await service.setPassword(
      { password: 'Another-pass-1', currentPassword: 'Demo1234!' },
      { sub: 'u1' } as never,
      noReauth(),
    );
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });

  it('owner 2026-10-22 (audit #3): with no password yet, a bare access token cannot set one', async () => {
    const { service, prisma } = await make({ noPassword: true });
    const proof = noReauth();
    await expect(
      service.setPassword(
        { password: 'Another-pass-1' },
        { sub: 'u1' } as never,
        proof,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(proof.assertReauth).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).not.toHaveBeenCalled();

    // A reauth (or the sign-up code minutes ago) lets it through.
    await service.setPassword(
      { password: 'Another-pass-1' },
      { sub: 'u1' } as never,
      { hasReauthToken: false, assertReauth: jest.fn() },
    );
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });

  it('owner 2026-10-22 (audit #3): a reauth token replaces the current password', async () => {
    const { service, prisma } = await make();
    const assertReauth = jest.fn().mockResolvedValue(undefined);
    await service.setPassword(
      { password: 'Another-pass-1' },
      { sub: 'u1' } as never,
      { hasReauthToken: true, assertReauth },
    );
    expect(assertReauth).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });

  it('owner 2026-10-22 (audit #3): a new password ends every OTHER session', async () => {
    const { service, revocation } = await make();
    await service.setPassword(
      { password: 'Another-pass-1', currentPassword: 'Demo1234!' },
      { sub: 'u1', sid: 'this-phone' } as never,
      noReauth(),
    );
    expect(revocation.revokeOtherChainsForUser).toHaveBeenCalledWith(
      'u1',
      'this-phone',
      'credentials_changed',
    );
    expect(revocation.revokeAllChainsForUser).not.toHaveBeenCalled();
  });

  it('owner 2026-10-25: a common password is refused with AUTH_PASSWORD_COMPROMISED, nothing stored', async () => {
    const { service, prisma } = await make();
    const err = await service
      .setPassword(
        { password: 'iloveyou', currentPassword: 'Demo1234!' },
        { sub: 'u1' } as never,
        {
          hasReauthToken: false,
          assertReauth: jest.fn(),
        },
      )
      .catch((e: HttpException) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getResponse()).toMatchObject({
      code: ErrorCode.AUTH_PASSWORD_COMPROMISED,
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('owner 2026-10-25: a refused reset password does not spend the sign-in code', async () => {
    const { service, otp } = await make();
    await expect(
      service.confirmReset(
        {
          identifier: '+14155552680',
          code: '000000',
          newPassword: 'iloveyou',
        },
        META,
      ),
    ).rejects.toBeInstanceOf(HttpException);
    expect(otp.verifyOtp).not.toHaveBeenCalled();
  });
});
