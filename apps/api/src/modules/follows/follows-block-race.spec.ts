import { FollowsService } from './follows.service';

/**
 * Verify batch 7 (BL1, 2026-11-17): the follow insert runs under the same
 * per-pair lock as BlocksService.block and re-checks the block there, so a
 * block committed while the follow waited refuses it (no follow survives).
 */
describe('FollowsService.follow under the per-pair block lock', () => {
  function make(blockedUnderLock: boolean) {
    const tx = {
      $executeRaw: jest.fn(() => Promise.resolve(1)),
      userBlock: {
        findFirst: jest.fn(() =>
          Promise.resolve(blockedUnderLock ? { blocker_id: 'att' } : null),
        ),
      },
      follow: { createMany: jest.fn(() => Promise.resolve({ count: 1 })) },
    };
    const prisma = {
      user: {
        findFirst: jest.fn(() =>
          Promise.resolve({
            role: 'attorney',
            status: 'active',
            attorney_profile: { verification_status: 'verified' },
          }),
        ),
      },
      follow: { createMany: jest.fn(() => Promise.resolve({ count: 1 })) },
      followTombstone: { deleteMany: jest.fn(() => Promise.resolve({})) },
      attorneyProfile: {
        findUnique: jest.fn(() => Promise.resolve({ followers_count: 1 })),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const svc = new FollowsService(
      prisma as never,
      { consume: jest.fn() } as never,
      {
        bump: jest.fn(),
        pending: jest.fn(() => Promise.resolve(new Map())),
      } as never,
      { emit: jest.fn() } as never,
      {} as never,
      {} as never,
      // The check before the lock saw no block yet.
      { assertNotBlocked: jest.fn() } as never,
      { set: jest.fn(() => Promise.resolve('OK')) } as never,
    );
    return { svc, tx, prisma };
  }
  const me = { sub: 'me', role: 'client' } as never;

  it('a block committed while the follow waited for the lock refuses it', async () => {
    const { svc, tx, prisma } = make(true);
    await expect(svc.follow(me, 'att')).rejects.toMatchObject({
      response: { code: 'USER_BLOCKED' },
    });
    const call = tx.$executeRaw.mock.calls[0] as unknown as unknown[];
    expect(call?.[1]).toBe('block-pair:att:me');
    expect(tx.follow.createMany).not.toHaveBeenCalled();
    expect(prisma.follow.createMany).not.toHaveBeenCalled();
  });

  it('no block: the follow is inserted inside the locked transaction', async () => {
    const { svc, tx } = make(false);
    await expect(svc.follow(me, 'att')).resolves.toMatchObject({
      following: true,
    });
    expect(tx.follow.createMany).toHaveBeenCalledTimes(1);
  });
});
