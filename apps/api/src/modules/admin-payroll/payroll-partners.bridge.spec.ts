import type { PrismaService } from '../../prisma/prisma.service';
import type { PartnersService } from '../partners/partners.service';
import type { PayrollAccrualsService } from './payroll-accruals.service';
import { PayrollPartnersBridge } from './payroll-partners.bridge';

describe('PayrollPartnersBridge', () => {
  function make() {
    let listener: (
      items: { ref: string; payoutId: string }[],
      state: 'paid' | 'unpaid',
    ) => Promise<void> = () => Promise.resolve();
    const accruals = {
      accrue: jest.fn().mockResolvedValue({ created: true }),
      cancel: jest.fn().mockResolvedValue('canceled'),
      onSettled: jest.fn((l: typeof listener) => {
        listener = l;
      }),
    };
    const partners = {
      listPayable: jest.fn().mockResolvedValue([
        {
          id: 'c1',
          partner_id: 'p1',
          partner_user_id: 'u1',
          amount_cents: 5_000,
          period: '2026-10',
        },
      ]),
      markPaid: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const prisma = {
      partner: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'p1', user_id: 'u1', label: null }]),
      },
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'u1', first_name: 'Ivan', last_name: 'B' },
          ]),
      },
      payrollAccrual: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { event_ref: 'partner:c1' },
            { event_ref: 'partner:00000000-0000-4000-8000-0000000000c0' },
            { event_ref: 'partner:e2e:not-a-commission' },
          ]),
      },
      partnerCommission: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: '00000000-0000-4000-8000-0000000000c0' }]),
      },
    };
    const bridge = new PayrollPartnersBridge(
      prisma as unknown as PrismaService,
      accruals as unknown as PayrollAccrualsService,
      partners as unknown as PartnersService,
    );
    bridge.onModuleInit();
    return { bridge, accruals, partners, settle: () => listener };
  }

  it('brings approved commissions in and drops ones settled elsewhere', async () => {
    const t = make();
    await t.bridge.sync();
    expect(t.accruals.accrue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        name: 'Ivan B',
        eventRef: 'partner:c1',
        amountCents: 5_000,
      }),
    );
    expect(t.accruals.cancel).toHaveBeenCalledTimes(1);
    expect(t.accruals.cancel).toHaveBeenCalledWith(
      'partner:00000000-0000-4000-8000-0000000000c0',
      expect.any(String),
    );
  });

  it('marks commissions paid with the payroll payout as the reference', async () => {
    const t = make();
    await t.settle()(
      [
        { ref: 'partner:c1', payoutId: 'po1' },
        { ref: 'admin:x', payoutId: 'po1' },
      ],
      'paid',
    );
    expect(t.partners.markPaid).toHaveBeenCalledWith(['c1'], {
      payoutRef: 'payroll:po1',
    });
  });

  it('a failing partner side never breaks payroll', async () => {
    const t = make();
    t.partners.listPayable.mockRejectedValue(new Error('db down'));
    await expect(t.bridge.sync()).resolves.toBeUndefined();
  });
});
