import { AppSettingsWriter } from './app-settings.writer';

describe('AppSettingsWriter.remove', () => {
  it('deletes the rows, records before / after in the same transaction and drops the cache', async () => {
    const tx = {
      appConfig: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ key: 'budget.sms.monthly_max', value: 0 }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const redis = {
      del: jest.fn().mockResolvedValue(1),
      incr: jest.fn().mockResolvedValue(1),
    };
    const w = new AppSettingsWriter(
      prisma as never,
      audit as never,
      redis as never,
    );
    await w.remove('admin-1', 'ops.cost_registry_mode', [
      'budget.sms.monthly_max',
    ]);
    expect(tx.appConfig.deleteMany).toHaveBeenCalledWith({
      where: { key: { in: ['budget.sms.monthly_max'] } },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 'admin-1',
        before: { 'budget.sms.monthly_max': 0 },
        after: { 'budget.sms.monthly_max': null },
      }),
      tx,
    );
    expect(redis.del).toHaveBeenCalled();
  });

  it('does nothing for an empty list', async () => {
    const prisma = { $transaction: jest.fn() };
    const w = new AppSettingsWriter(prisma as never, {} as never, {} as never);
    await w.remove('a', 'x', []);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
