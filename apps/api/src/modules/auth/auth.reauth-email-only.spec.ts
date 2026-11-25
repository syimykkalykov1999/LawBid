import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

/** Pack E (25.11, owner rule sms-two-cases): POST /auth/reauth with a code
 * takes the verified e-mail only. The account's own phone never gets a
 * code (an SMS only at registration and «Забыл пароль»), so a phone
 * identifier is refused before any code check, like a foreign one. */
describe('AuthService.reauth: e-mail code only', () => {
  function make() {
    const account = {
      id: 'u1',
      phone_e164: '+15551234567',
      phone_verified_at: new Date(1),
      email: 'Ann@Example.com',
      email_verified_at: new Date(1),
    };
    const svc = Object.create(AuthService.prototype) as AuthService;
    const verify = jest.fn().mockResolvedValue('ok');
    const record = jest.fn().mockResolvedValue(undefined);
    Object.assign(svc, {
      prisma: {
        user: { findUniqueOrThrow: jest.fn().mockResolvedValue(account) },
      },
      authEvents: { record },
      tokens: { signReauthToken: jest.fn().mockReturnValue('reauth-t') },
      verifyScopedCode: verify,
    });
    return { svc, verify, record };
  }
  const user = { sub: 'u1', sid: 's1' } as never;

  it('the account phone is refused, no code is checked', async () => {
    const { svc, verify, record } = make();
    await expect(
      svc.reauth({ identifier: '+15551234567', code: '123456' } as never, user),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verify).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'reauth_failed', success: false }),
    );
  });

  it('the verified e-mail gives the step-up token', async () => {
    const { svc, verify } = make();
    await expect(
      svc.reauth(
        { identifier: 'ann@example.com', code: '123456' } as never,
        user,
      ),
    ).resolves.toEqual({ reauthToken: 'reauth-t' });
    expect(verify).toHaveBeenCalledWith(
      'email',
      'ann@example.com',
      '123456',
      'reauth',
      's1',
      undefined,
    );
  });
});
