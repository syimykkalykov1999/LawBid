import type { PrismaService } from '../../../prisma/prisma.service';
import { PushTokensService } from './push-tokens.service';

/** 2026-11-07: a device moving from its registration token to its Firebase
 * Installation ID keeps one row (never two pushes), and sign-out removes
 * both. */
describe('PushTokensService FID transition', () => {
  function build() {
    const prisma = {
      session: {
        findFirst: jest.fn().mockResolvedValue({ id: 's2' }),
        findMany: jest.fn().mockResolvedValue([{ id: 's1' }, { id: 's2' }]),
      },
      pushToken: {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    return {
      prisma,
      service: new PushTokensService(prisma as unknown as PrismaService),
    };
  }

  it('an FID registration stores the kind and drops the same device legacy token', async () => {
    const { prisma, service } = build();
    await service.register(
      'u',
      'chain',
      'fid-00000000000000000000',
      'android',
      true,
      true,
      true,
      'fid',
    );
    const upsert = prisma.pushToken.upsert.mock.calls[0][0];
    expect(upsert.create.token_kind).toBe('fid');
    expect(upsert.update.token_kind).toBe('fid');
    expect(prisma.session.findMany).toHaveBeenCalledWith({
      where: { user_id: 'u', session_chain_id: 'chain' },
      select: { id: true },
    });
    expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({
      where: {
        user_id: 'u',
        token_kind: 'token',
        session_id: { in: ['s1', 's2'] },
        fcm_token: { not: 'fid-00000000000000000000' },
      },
    });
  });

  it('a legacy token registration (older app) keeps other rows', async () => {
    const { prisma, service } = build();
    await service.register('u', 'chain', 'legacy-token-000000000', 'ios');
    expect(prisma.pushToken.upsert.mock.calls[0][0].create.token_kind).toBe(
      'token',
    );
    expect(prisma.session.findMany).not.toHaveBeenCalled();
    expect(prisma.pushToken.deleteMany).not.toHaveBeenCalled();
  });

  it('sign-out removes the FID and a legacy token of the same device', async () => {
    const { prisma, service } = build();
    await service.unregister('u', 'fid-00000000000000000000', 'chain');
    expect(prisma.pushToken.deleteMany).toHaveBeenNthCalledWith(1, {
      where: { user_id: 'u', fcm_token: 'fid-00000000000000000000' },
    });
    expect(prisma.pushToken.deleteMany).toHaveBeenNthCalledWith(2, {
      where: {
        user_id: 'u',
        token_kind: 'token',
        session_id: { in: ['s1', 's2'] },
        fcm_token: { not: 'fid-00000000000000000000' },
      },
    });
  });

  it('activeDevices marks FIDs and drops signed-out devices', async () => {
    const { prisma, service } = build();
    Object.assign(prisma, {
      $queryRaw: jest.fn().mockResolvedValue([
        { token: 'fid-a', kind: 'fid', alive: true },
        { token: 'tok-b', kind: 'token', alive: true },
        { token: 'tok-dead', kind: 'token', alive: false },
      ]),
    });
    expect(await service.activeDevices('u')).toEqual([
      { token: 'fid-a', fid: true },
      { token: 'tok-b', fid: false },
    ]);
    expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({
      where: { fcm_token: { in: ['tok-dead'] } },
    });
    expect(await service.activeTokens('u')).toEqual(['fid-a', 'tok-b']);
  });
});
