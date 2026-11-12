import { BadRequestException } from '@nestjs/common';
import { AdminOutreachService } from './admin-outreach.service';

/** Owner 2026-11-12: the owner assigns any number of leads at once, one
 * transaction (and one audit row) per chunk of 500. */
describe('AdminOutreachService.assign without a cap for the owner', () => {
  function build() {
    const findMany = jest
      .fn()
      .mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.map((id) => ({ id, partner_id: null }))),
      );
    const tx = {
      outreachLead: { findMany, updateMany: jest.fn() },
      outreachActivity: { createMany: jest.fn() },
    };
    const $transaction = jest.fn((fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    );
    const record = jest.fn().mockResolvedValue(undefined);
    const svc = Object.create(
      AdminOutreachService.prototype,
    ) as AdminOutreachService;
    Object.assign(svc, {
      prisma: { $transaction },
      audit: { record },
      core: {
        scopeFor: jest.fn().mockResolvedValue({ partner: null, manager: true }),
      },
    });
    jest
      .spyOn(
        svc as unknown as { partnerOrThrow: () => Promise<{ id: string }> },
        'partnerOrThrow',
      )
      .mockResolvedValue({ id: 'partner-1' });
    return { svc, findMany, $transaction, record };
  }
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `l${i}`);

  it('the owner assigns 1 200 leads in three transactions', async () => {
    const { svc, findMany, $transaction, record } = build();
    const owner = { id: 'o', ip: null, adminRole: 'super_admin' } as never;
    const out = await svc.assign(owner, {
      leadIds: ids(1200),
      partnerId: 'partner-1',
    });
    expect(out).toEqual({ updated: 1200 });
    expect($transaction).toHaveBeenCalledTimes(3);
    expect(record).toHaveBeenCalledTimes(3);
    for (const [a] of findMany.mock.calls as [
      { where: { id: { in: string[] } } },
    ][]) {
      expect(a.where.id.in.length).toBeLessThanOrEqual(500);
    }
  });

  it('staff managers keep 500', async () => {
    const { svc, $transaction } = build();
    const staff = { id: 's', ip: null, adminRole: 'support' } as never;
    await expect(
      svc.assign(staff, { leadIds: ids(501), partnerId: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect($transaction).not.toHaveBeenCalled();
  });
});
