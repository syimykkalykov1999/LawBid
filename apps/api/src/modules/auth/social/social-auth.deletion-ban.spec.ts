/* eslint-disable @typescript-eslint/require-await */
import { ForbiddenException } from '@nestjs/common';
import { SocialAuthService } from './social-auth.service';

/**
 * Final pass 18.11 (FO5): an Apple / Google sign-in of an account with a
 * pending deletion cancels that deletion only for a sign-in that is allowed.
 * The person's own ban (user, phone, e-mail) was checked only later, in
 * finishLogin → issueLogin, so a refused sign-in had already undone the
 * erasure request.
 */
describe('SocialAuthService: a banned account keeps its pending deletion', () => {
  function setup(banned: boolean) {
    const user = {
      id: 'u1',
      status: 'deletion_pending',
      phone_e164: '+13125550101',
      email: 'a@example.com',
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      userIdentifier: {
        findUnique: jest.fn().mockResolvedValue({ user_id: 'u1' }),
      },
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
    const auth = {
      assertEmailAllowedForSignup: jest.fn(),
      finishLogin: jest.fn(async () => {
        // The real finishLogin ends in issueLogin, which checks the bans
        // of the person (userId, phone, e-mail).
        await bans.assertAllowed({ userId: 'u1' });
        return { accessToken: 't' };
      }),
    };
    const svc = new SocialAuthService(
      {} as never,
      {
        verify: jest.fn().mockResolvedValue({
          providerUid: 'apple-1',
          email: 'a@example.com',
          emailVerified: true,
        }),
      } as never,
      {
        findOrCreateForSocial: jest
          .fn()
          .mockResolvedValue({ user, isNewUser: false }),
      } as never,
      { record: jest.fn() } as never,
      prisma as never,
      {
        consumeFixedWindow: jest.fn().mockResolvedValue({ allowed: true }),
      } as never,
      {
        assertEnabled: jest.fn(),
        assertPlatformAllowed: jest.fn(),
      } as never,
      { getOrThrow: jest.fn().mockReturnValue(100) } as never,
      auth as never,
      bans as never,
    );
    return { svc, updateMany, auth };
  }

  const dto = { provider: 'apple', idToken: 'x', nonce: 'n' } as never;
  const meta = { ip: '203.0.113.5' } as never;

  it('FO5: a banned person is refused and the deletion stays pending', async () => {
    const h = setup(true);
    await expect(h.svc.login(dto, meta)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it('an allowed sign-in still cancels the pending deletion', async () => {
    const h = setup(false);
    await h.svc.login(dto, meta);
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', status: 'deletion_pending' },
      data: { status: 'active', deletion_requested_at: null },
    });
  });
});
