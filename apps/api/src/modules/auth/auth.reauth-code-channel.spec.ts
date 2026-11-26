import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

/** Owner 25.11 («по умолчанию SMS», `auth.code_channel`): POST /auth/reauth
 * with a code takes the account's OWN verified phone or e-mail. The request
 * sends to the contact the admin's channel picks, which may be the other
 * one the app named, so an empty slot under the named one is followed by
 * the other own contact (an 'expired' check spends no attempt). A foreign
 * or unverified identifier is refused before any code check. */
describe('AuthService.reauth: the code of the chosen channel', () => {
  function make(
    results: Record<string, string> = {},
    over: Partial<Record<string, unknown>> = {},
  ) {
    const account = {
      id: 'u1',
      phone_e164: '+15551234567',
      phone_verified_at: new Date(1),
      email: 'Ann@Example.com',
      email_verified_at: new Date(1),
      ...over,
    };
    const svc = Object.create(AuthService.prototype) as AuthService;
    const verify = jest.fn((channel: string) =>
      Promise.resolve(results[channel] ?? 'expired'),
    );
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
  const go = (svc: AuthService, identifier: string) =>
    svc.reauth({ identifier, code: '123456' } as never, user);

  it('the SMS code to the verified phone gives the step-up token', async () => {
    const { svc, verify } = make({ phone: 'ok' });
    await expect(go(svc, '+15551234567')).resolves.toEqual({
      reauthToken: 'reauth-t',
    });
    expect(verify).toHaveBeenCalledWith(
      'phone',
      '+15551234567',
      '123456',
      'reauth',
      's1',
      undefined,
    );
  });

  it('the e-mail code to the verified e-mail gives the step-up token', async () => {
    const { svc, verify } = make({ email: 'ok' });
    await expect(go(svc, 'ann@example.com')).resolves.toEqual({
      reauthToken: 'reauth-t',
    });
    expect(verify).toHaveBeenCalledWith(
      'email',
      'Ann@Example.com',
      '123456',
      'reauth',
      's1',
      undefined,
    );
  });

  it('an app that named the e-mail while the code went by SMS still confirms', async () => {
    const { svc, verify } = make({ phone: 'ok' });
    await expect(go(svc, 'ann@example.com')).resolves.toEqual({
      reauthToken: 'reauth-t',
    });
    expect(verify.mock.calls.map((c) => c[0])).toEqual(['email', 'phone']);
  });

  it('a wrong code under the named contact is not retried on the other', async () => {
    const { svc, verify } = make({ phone: 'invalid', email: 'ok' });
    await expect(go(svc, '+15551234567')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('a phone that is not verified is refused, no code is checked', async () => {
    const { svc, verify, record } = make(
      { phone: 'ok' },
      { phone_verified_at: null },
    );
    await expect(go(svc, '+15551234567')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verify).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'reauth_failed', success: false }),
    );
  });

  it('a foreign number is refused, no code is checked', async () => {
    const { svc, verify } = make({ phone: 'ok' });
    await expect(go(svc, '+15550000000')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verify).not.toHaveBeenCalled();
  });
});

/** Owner 25.11: the request picks the target among the caller's own
 * verified contacts by `auth.code_channel`, falling back to the other. */
describe('AuthService.requestPurpose: a step-up code goes by the chosen channel', () => {
  type Target = { channel: string; identifier: string } | undefined;
  function make(
    preferred: 'phone' | 'email',
    over: Partial<Record<string, unknown>> = {},
    emailFlows = true,
  ) {
    const account = {
      phone_e164: '+15551234567',
      phone_verified_at: new Date(1),
      email: 'ann@example.com',
      email_verified_at: new Date(1),
      ...over,
    };
    const svc = Object.create(AuthService.prototype) as AuthService;
    Object.assign(svc, {
      prisma: { user: { findUnique: jest.fn().mockResolvedValue(account) } },
      codeChannel: { preferred: jest.fn().mockResolvedValue(preferred) },
      loginMethods: { isEnabled: jest.fn().mockResolvedValue(emailFlows) },
    });
    const ask = (channel: 'phone' | 'email', identifier: string) =>
      (
        svc as unknown as {
          requestPurpose(
            d: unknown,
            i: string,
            c: unknown,
          ): Promise<{ purpose: string; scope: unknown; target: Target }>;
        }
      ).requestPurpose({ channel, identifier, purpose: 'reauth' }, identifier, {
        id: 'u1',
        sid: 's1',
      });
    return { ask };
  }

  it('sms (default): the phone, also when the app named the e-mail', async () => {
    const { ask } = make('phone');
    await expect(ask('email', 'ann@example.com')).resolves.toMatchObject({
      purpose: 'reauth',
      scope: { bind: 's1' },
      target: { channel: 'phone', identifier: '+15551234567' },
    });
    await expect(ask('phone', '+15551234567')).resolves.toMatchObject({
      target: { channel: 'phone', identifier: '+15551234567' },
    });
  });

  it('email: the e-mail, also when the app named the phone', async () => {
    const { ask } = make('email');
    await expect(ask('phone', '+15551234567')).resolves.toMatchObject({
      target: { channel: 'email', identifier: 'ann@example.com' },
    });
  });

  it('email while e-mail flows are off: the phone', async () => {
    const { ask } = make('email', {}, false);
    await expect(ask('phone', '+15551234567')).resolves.toMatchObject({
      target: { channel: 'phone' },
    });
  });

  it('fallback: no verified e-mail → the phone; no verified phone → the e-mail', async () => {
    await expect(
      make('email', { email_verified_at: null }).ask('phone', '+15551234567'),
    ).resolves.toMatchObject({ target: { channel: 'phone' } });
    await expect(
      make('phone', { phone_verified_at: null }).ask(
        'email',
        'ann@example.com',
      ),
    ).resolves.toMatchObject({ target: { channel: 'email' } });
  });

  it('a contact that is not the caller’s own verified one is refused', async () => {
    await expect(
      make('phone').ask('phone', '+15550000000'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      make('phone', { phone_verified_at: null }).ask('phone', '+15551234567'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
