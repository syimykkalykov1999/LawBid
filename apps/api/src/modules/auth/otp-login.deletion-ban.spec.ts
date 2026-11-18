/* eslint-disable @typescript-eslint/require-await */
import { ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * Final pass 18.11 (FO5, OTP and e-mail link): a sign-in by code or magic
 * link of an account with a pending deletion cancels it only when the
 * sign-in is allowed. The person's own ban (account, phone, e-mail) was
 * checked only in issueLogin, after the cancel had already been committed.
 */
describe('AuthService completeOtpLogin: a banned account keeps its pending deletion', () => {
  function setup(banned: boolean) {
    const user = {
      id: 'u1',
      status: 'deletion_pending',
      phone_e164: '+13125550101',
      email: 'a@example.com',
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      user: {
        updateMany,
        findUnique: jest.fn().mockResolvedValue({ ...user, status: 'active' }),
      },
    };
    const bans = {
      assertAllowed: jest.fn(async (q: { userId?: string }) => {
        if (banned && q.userId === 'u1') {
          throw new ForbiddenException({ code: 'ACCOUNT_BANNED' });
        }
      }),
    };
    const svc = Object.create(AuthService.prototype) as AuthService;
    Object.assign(svc, {
      bans,
      settings: { boolean: jest.fn().mockResolvedValue(true) },
      prisma: {
        $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
      },
      identity: {
        findOrCreateForOtp: jest
          .fn()
          .mockResolvedValue({ user, isNewUser: false }),
      },
      // The real finishLogin ends in issueLogin, which checks the bans of
      // the person (userId, phone, e-mail).
      finishLogin: jest.fn(async () => {
        await bans.assertAllowed({ userId: 'u1' });
        return { accessToken: 't' };
      }),
    });
    const login = (channel: 'phone' | 'email', id: string) =>
      (
        svc as unknown as {
          completeOtpLogin: (
            c: string,
            i: string,
            d: object,
            m: object,
          ) => Promise<unknown>;
        }
      ).completeOtpLogin(channel, id, {}, { ip: '203.0.113.5' });
    return { login, updateMany };
  }

  it('FO5: a banned person signing in by code is refused and the deletion stays pending', async () => {
    const h = setup(true);
    await expect(h.login('phone', '+13125550101')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it('FO5: the same for the e-mail link', async () => {
    const h = setup(true);
    await expect(h.login('email', 'a@example.com')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it('an allowed sign-in still cancels the pending deletion', async () => {
    const h = setup(false);
    await h.login('phone', '+13125550101');
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', status: 'deletion_pending' },
      data: { status: 'active', deletion_requested_at: null },
    });
  });
});
