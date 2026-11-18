import { UnauthorizedException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { AuthService } from './auth.service';

/** AU3 (17.11): the «signed in on another phone — continue?» token
 * (`auth:pending:<token>`, 5 min) must not outlive a password change: a
 * thief who got that far with the old password is refused after the owner
 * resets it (or the admin drops it). */
describe('AuthService pending sign-in vs a password change', () => {
  const T1 = new Date('2026-11-17T10:00:00.000Z');
  const T2 = new Date('2026-11-17T10:02:00.000Z');

  function make() {
    const service = Object.create(AuthService.prototype) as AuthService;
    const store = new Map<string, string>();
    const redis = {
      set: jest.fn((k: string, v: string) => {
        store.set(k, v);
        return Promise.resolve('OK');
      }),
      getdel: jest.fn((k: string) => {
        const v = store.get(k) ?? null;
        store.delete(k);
        return Promise.resolve(v);
      }),
    };
    const user = {
      id: 'u1',
      status: 'active',
      password_set_at: T1 as Date | null,
    };
    const prisma = {
      user: {
        findUniqueOrThrow: jest.fn(() => Promise.resolve({ ...user })),
      },
    };
    const sessions = {
      otherActiveDevice: jest.fn().mockResolvedValue({
        device_name: 'Old phone',
        platform: 'ios',
        last_used_at: T1,
      }),
    };
    const loginMethods = {
      assertPlatformAllowed: jest.fn().mockResolvedValue(undefined),
    };
    const authEvents = { record: jest.fn().mockResolvedValue(undefined) };
    const issueLogin = jest.fn().mockResolvedValue({ accessToken: 'a' });
    Object.assign(service, {
      redis,
      prisma,
      sessions,
      loginMethods,
      authEvents,
      issueLogin,
    });
    return { service, user, issueLogin };
  }

  async function pendingToken(
    service: AuthService,
    user: { id: string; status: string; password_set_at: Date | null },
  ): Promise<string> {
    const err = (await service
      .finishLogin(
        { ...user } as never,
        false,
        false,
        'password:+14155552680',
        { deviceId: 'new-phone', platform: 'android' },
        {},
      )
      .catch((e: unknown) => e)) as { getResponse(): unknown };
    const body = err.getResponse() as {
      code: string;
      details: { pendingToken: string };
    };
    expect(body.code).toBe(ErrorCode.AUTH_OTHER_DEVICE_ACTIVE);
    return body.details.pendingToken;
  }

  it('continues when the password did not change', async () => {
    const { service, user, issueLogin } = make();
    const token = await pendingToken(service, user);
    await expect(service.continueLogin(token, {})).resolves.toEqual({
      accessToken: 'a',
    });
    expect(issueLogin).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['reset to a new password', T2],
    ['dropped by the admin', null],
  ])('is refused once the password was %s', async (_label, after) => {
    const { service, user, issueLogin } = make();
    const token = await pendingToken(service, user);
    user.password_set_at = after;
    const err = await service.continueLogin(token, {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect((err as UnauthorizedException).getResponse()).toMatchObject({
      code: ErrorCode.AUTH_OTP_EXPIRED,
    });
    expect(issueLogin).not.toHaveBeenCalled();
  });
});
