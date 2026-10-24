import { ForbiddenException } from '@nestjs/common';
import { PasswordAuthService } from './password-auth.service';
import { PasswordService } from './services/password.service';
import { AUTH_EVENT_TYPES } from './services/auth-event.service';
import { ErrorCode } from '../../common/errors/error-code.enum';

const META = { ip: '1.2.3.4' };
const TOKENS = { accessToken: 'a', refreshToken: 'r' };

async function make(opts: {
  role: string | null;
  passkeys: number;
  switchOn?: boolean;
  withSettings?: boolean;
}) {
  const passwords = new PasswordService();
  const hash = await passwords.hash('Demo1234!');
  const user = {
    id: 'u1',
    role: opts.role,
    status: 'active',
    phone_e164: '+14155552680',
    phone_verified_at: new Date(),
    email: null,
    email_verified_at: null,
    password_hash: hash,
  };
  const prisma = {
    userIdentifier: { findUnique: jest.fn().mockResolvedValue({ user }) },
    webauthnCredential: { count: jest.fn().mockResolvedValue(opts.passkeys) },
  };
  const auth = { finishLogin: jest.fn().mockResolvedValue(TOKENS) };
  const rateLimit = {
    hashIdentifier: jest.fn((v: string) => `h(${v})`),
    consumeSlidingWindow: jest
      .fn()
      .mockResolvedValue({ allowed: true, remaining: 1, retryAfterSeconds: 1 }),
  };
  const authEvents = { record: jest.fn().mockResolvedValue(undefined) };
  const loginMethods = {
    assertEnabled: jest.fn().mockResolvedValue(undefined),
    assertPlatformAllowed: jest.fn().mockResolvedValue(undefined),
    isEnabled: jest.fn().mockResolvedValue(true),
  };
  const settings = {
    boolean: jest.fn().mockResolvedValue(opts.switchOn ?? true),
  };
  const service = new PasswordAuthService(
    prisma as never,
    auth as never,
    passwords,
    rateLimit as never,
    {} as never,
    authEvents as never,
    loginMethods as never,
    { assertAllowed: jest.fn().mockResolvedValue(undefined) } as never,
    {} as never,
    opts.withSettings === false ? undefined : (settings as never),
  );
  return { service, prisma, auth, authEvents, settings };
}

const LOGIN = { identifier: '+14155552680', password: 'Demo1234!' };

describe('security.attorney_strong_auth (security & legal pass 2026-10-24)', () => {
  it('refuses the password alone for an attorney who has a passkey', async () => {
    const { service, auth, authEvents } = await make({
      role: 'attorney',
      passkeys: 1,
    });
    const err = await service.login(LOGIN, META).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({
      code: ErrorCode.AUTH_PROVIDER_DISABLED,
      details: { method: 'password', reason: 'passkey_enrolled' },
    });
    expect(auth.finishLogin).not.toHaveBeenCalled();
    expect(authEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AUTH_EVENT_TYPES.PASSWORD_LOGIN_FAILED,
        success: false,
        meta: { reason: 'passkey_enrolled' },
      }),
    );
  });

  it('applies to an assistant working inside an attorney account too', async () => {
    const { service, auth } = await make({ role: 'assistant', passkeys: 2 });
    await expect(service.login(LOGIN, META)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(auth.finishLogin).not.toHaveBeenCalled();
  });

  it('lets an attorney without a passkey sign in as before', async () => {
    const { service, auth } = await make({ role: 'attorney', passkeys: 0 });
    await expect(service.login(LOGIN, META)).resolves.toEqual(TOKENS);
    expect(auth.finishLogin).toHaveBeenCalled();
  });

  it('does not touch clients', async () => {
    const { service, prisma } = await make({ role: 'client', passkeys: 3 });
    await expect(service.login(LOGIN, META)).resolves.toEqual(TOKENS);
    expect(prisma.webauthnCredential.count).not.toHaveBeenCalled();
  });

  it('is a switch: off means the password always works', async () => {
    const { service } = await make({
      role: 'attorney',
      passkeys: 1,
      switchOn: false,
    });
    await expect(service.login(LOGIN, META)).resolves.toEqual(TOKENS);
  });

  it('counts only passkeys of the app, not of the admin panel', async () => {
    const { service, prisma } = await make({ role: 'attorney', passkeys: 1 });
    await service.login(LOGIN, META).catch(() => undefined);
    expect(prisma.webauthnCredential.count).toHaveBeenCalledWith({
      where: { user_id: 'u1', scope: 'user' },
    });
  });
});
