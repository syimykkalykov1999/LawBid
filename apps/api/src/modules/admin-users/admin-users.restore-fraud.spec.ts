import { AdminUsersService } from './admin-users.service';

jest.mock('../../prisma/tx-retry.util', () => ({
  withTxRetry: (prisma: unknown, fn: (tx: unknown) => unknown) => fn(prisma),
}));

/**
 * Verify batch 11 (B8): suspend spreads the block to the person's linked
 * accounts (fraud.onBanned); restore must undo it (fraud.onRestored).
 */
describe('AdminUsersService.restore undoes the spread block (B8)', () => {
  it('asks the fraud module to bring the linked accounts back', async () => {
    const svc = Object.create(AdminUsersService.prototype) as AdminUsersService;
    const onRestored = jest.fn().mockResolvedValue(1);
    Object.assign(svc, {
      prisma: {
        user: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'u1',
            role: 'client',
            status: 'suspended',
            deleted_at: null,
            suspended_reason: 'spam',
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        moderationAction: { create: jest.fn().mockResolvedValue({}) },
      },
      audit: { record: jest.fn().mockResolvedValue(undefined) },
      fraud: { onRestored },
    });
    await svc.restore({ id: 'a', ip: null, countries: null } as never, 'u1');
    expect(onRestored).toHaveBeenCalledWith('u1');
  });
});
