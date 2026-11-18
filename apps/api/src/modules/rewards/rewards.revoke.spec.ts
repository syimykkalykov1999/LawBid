import { RewardsService } from './rewards.service';
import { previousPeriod } from './rewards.rules';

/**
 * Batch 8 RW1 (audit 2026-11-17): a prize the owner took back stays taken
 * back. The daily auto-award used to see the department without a prize
 * (the row was deleted) and gave the same prize again, with a new bonus.
 */
describe('RewardsService.revoke sticks (RW1)', () => {
  function setup() {
    const tx = {
      staffReward: { delete: jest.fn(() => Promise.resolve({})) },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      staffReward: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            id: 'w1',
            period: '2026-10',
            department: 'support',
            admin_id: 'a1',
            accrual_id: null,
            bonus_cents: 5000,
          }),
        ),
        delete: jest.fn(() => Promise.resolve({})),
      },
      auditLog: {
        findMany: jest.fn(() =>
          Promise.resolve([
            { before: { period: '2026-10', department: 'support' } },
          ]),
        ),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const settings = {
      boolean: jest.fn(() => Promise.resolve(true)),
      string: jest.fn(() => Promise.resolve('month')),
    };
    const audit = { record: jest.fn(() => Promise.resolve()) };
    const accruals = { cancel: jest.fn(() => Promise.resolve('canceled')) };
    const logger = { setContext: jest.fn(), warn: jest.fn() };
    const service = new RewardsService(
      prisma as never,
      settings as never,
      {} as never,
      {} as never,
      audit as never,
      accruals as never,
      logger as never,
    );
    return { service, prisma, tx, audit, accruals };
  }

  it('the delete and its audit record are one transaction; the bonus accrual is canceled even without a stored link', async () => {
    const s = setup();
    await s.service.revoke('owner', 'w1');
    expect(s.accruals.cancel).toHaveBeenCalledWith(
      'reward:w1',
      'prize revoked',
    );
    expect(s.tx.staffReward.delete).toHaveBeenCalledWith({
      where: { id: 'w1' },
    });
    expect(s.prisma.staffReward.delete).not.toHaveBeenCalled();
    expect(s.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'rewards.award.revoke',
        before: { period: '2026-10', department: 'support' },
      }),
      s.tx,
    );
  });

  it('the auto-award skips a department whose prize for that period was revoked', async () => {
    const s = setup();
    const now = new Date('2026-11-03T10:00:00Z');
    const p = previousPeriod('month', now);
    expect(p).toBe('2026-10');
    jest.spyOn(s.service, 'leaderboard').mockResolvedValue({
      period: p,
      departments: [
        { key: 'support', award: null, rows: [{ adminId: 'a1', rank: 1 }] },
        { key: 'finance', award: null, rows: [{ adminId: 'a2', rank: 1 }] },
      ],
    } as never);
    const give = jest.spyOn(s.service, 'give').mockResolvedValue({} as never);
    expect(await s.service.autoAward(now)).toBe(1);
    expect(give).toHaveBeenCalledTimes(1);
    expect(give).toHaveBeenCalledWith(
      null,
      { period: p, department: 'finance', adminId: 'a2' },
      true,
    );
    expect(s.prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ action: 'rewards.award.revoke' }),
      }),
    );
  });
});
