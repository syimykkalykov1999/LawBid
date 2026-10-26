import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { AccountBansService, normalizeBanValue } from './account-bans.service';

function make(found: unknown) {
  const findFirst = jest.fn().mockResolvedValue(found);
  const svc = new AccountBansService({
    accountBan: { findFirst },
  } as unknown as PrismaService);
  return { svc, findFirst };
}

describe('AccountBansService', () => {
  it('lets everyone through when no ban matches', async () => {
    const { svc } = make(null);
    await expect(
      svc.assertAllowed({ userId: 'u', phone: '+15550001111', deviceId: 'd' }),
    ).resolves.toBeUndefined();
  });

  it('asks for every identity at once and only for active bans', async () => {
    const { svc, findFirst } = make(null);
    await svc.assertAllowed({
      userId: 'u1',
      phone: ' +15550001111 ',
      email: 'A@B.com',
      deviceId: 'dev-1',
    });
    const where = findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { kind: 'user', value: 'u1' },
      { kind: 'phone', value: '+15550001111' },
      { kind: 'email', value: 'a@b.com' },
      { kind: 'device', value: 'dev-1' },
    ]);
    expect(where.lifted_at).toBeNull();
  });

  it('does not query without any identity', async () => {
    const { svc, findFirst } = make(null);
    await svc.assertAllowed({});
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('answers 403 ACCOUNT_SUSPENDED with reason and end date', async () => {
    const until = new Date('2026-12-01T00:00:00Z');
    const { svc } = make({ kind: 'device', reason: 'spam', expires_at: until });
    const err = (await svc
      .assertAllowed({ deviceId: 'd' })
      .catch((e: unknown) => e)) as ForbiddenException;
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toMatchObject({
      code: 'ACCOUNT_SUSPENDED',
      details: {
        blocked: true,
        kind: 'device',
        reason: 'spam',
        until: until.toISOString(),
      },
    });
  });

  it('normalizes e-mail only', () => {
    expect(normalizeBanValue('email', ' X@Y.Z ')).toBe('x@y.z');
    expect(normalizeBanValue('device', ' AbC ')).toBe('AbC');
  });
});
