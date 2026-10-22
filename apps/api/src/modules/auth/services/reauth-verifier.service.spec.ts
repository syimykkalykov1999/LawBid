import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import {
  FRESH_SIGN_IN_SECONDS,
  ReauthVerifier,
} from './reauth-verifier.service';

/** Owner 2026-10-22 (security audit #3): a contact or a password changes
 * only after a reauth token, or on a session that signed in minutes ago. */
function make(firstRowAgeSec: number | null, header?: string) {
  const tokens = {
    verifyReauthToken: jest
      .fn()
      .mockReturnValue({ sub: 'u1', sid: 's1', jti: 'j1' }),
  };
  const redis = { set: jest.fn().mockResolvedValue('OK'), exists: jest.fn() };
  const config = { getOrThrow: jest.fn().mockReturnValue(300) };
  const prisma = {
    session: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          firstRowAgeSec === null
            ? null
            : { created_at: new Date(Date.now() - firstRowAgeSec * 1000) },
        ),
    },
  };
  const verifier = new ReauthVerifier(
    tokens as never,
    redis as never,
    config as never,
    prisma as never,
  );
  const req = {
    user: { sub: 'u1', sid: 's1' },
    header: (name: string) =>
      name.toLowerCase() === 'x-reauth-token' ? header : undefined,
  };
  return { verifier, req: req as never, prisma, redis };
}

const codeOf = (e: unknown) =>
  ((e as ForbiddenException).getResponse() as { code: string }).code;

describe('ReauthVerifier.assertRecentAuthentication', () => {
  it('a session signed in a minute ago counts as the reauth', async () => {
    const { verifier, req, prisma } = make(60);
    await expect(verifier.assertRecentAuthentication(req)).resolves.toBe(
      undefined,
    );
    expect(prisma.session.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { session_chain_id: 's1', user_id: 'u1' },
        orderBy: { created_at: 'asc' },
      }),
    );
  });

  it('an older session (or a stolen token of one) needs a reauth token', async () => {
    const { verifier, req } = make(FRESH_SIGN_IN_SECONDS + 5);
    const err = await verifier
      .assertRecentAuthentication(req)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(codeOf(err)).toBe(ErrorCode.REAUTH_REQUIRED);
  });

  it('an unknown session is never fresh', async () => {
    const { verifier, req } = make(null);
    await expect(verifier.assertRecentAuthentication(req)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('a header token is consumed once, whatever the session age', async () => {
    const { verifier, req, redis, prisma } = make(
      FRESH_SIGN_IN_SECONDS * 10,
      't',
    );
    await verifier.assertRecentAuthentication(req);
    expect(redis.set).toHaveBeenCalledWith(
      'reauth:used:j1',
      '1',
      'EX',
      300,
      'NX',
    );
    expect(prisma.session.findFirst).not.toHaveBeenCalled();
    redis.set.mockResolvedValue(null);
    await expect(verifier.assertRecentAuthentication(req)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
