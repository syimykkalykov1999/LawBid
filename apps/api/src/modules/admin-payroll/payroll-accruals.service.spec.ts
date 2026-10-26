import {
  DEFAULT_PAYROLL_FEES,
  PayrollAccrualsService,
  stripeFee,
} from './payroll-accruals.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AppConfigService } from '../feature-flags/services/app-config.service';

describe('stripeFee', () => {
  it('takes 0.25% + 25¢, plus the monthly fee on the first payout', () => {
    expect(stripeFee(100_000, DEFAULT_PAYROLL_FEES, true)).toBe(475);
    expect(stripeFee(100_000, DEFAULT_PAYROLL_FEES, false)).toBe(275);
    expect(stripeFee(1_000, DEFAULT_PAYROLL_FEES, false)).toBe(28);
  });
});

describe('PayrollAccrualsService', () => {
  const row = {
    id: 'acc-1',
    employee_id: 'emp-1',
    status: 'pending',
    note: null,
  };

  function make(
    existing: typeof row | null,
    config: Record<string, unknown> = {},
  ) {
    const prisma = {
      payrollAccrual: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn().mockResolvedValue(row),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payrollEmployee: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'emp-1', currency: 'usd' }),
      },
    };
    const appConfig = { getConfig: jest.fn().mockResolvedValue(config) };
    const svc = new PayrollAccrualsService(
      prisma as unknown as PrismaService,
      appConfig as unknown as AppConfigService,
    );
    return { svc, prisma };
  }

  const input = {
    userId: 'user-1',
    name: 'Blogger',
    source: 'partner',
    eventRef: 'partner:1',
    amountCents: 5_000,
    period: '2026-10',
  };

  it('creates the payroll entry (salary 0) and the accrual once', async () => {
    const { svc, prisma } = make(null);
    await expect(svc.accrue(input)).resolves.toEqual({
      accrualId: 'acc-1',
      employeeId: 'emp-1',
      created: true,
      status: 'pending',
    });
    expect(prisma.payrollEmployee.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ user_id: 'user-1', amount_cents: 0 }),
    });
  });

  it('a repeated event changes nothing', async () => {
    const { svc, prisma } = make(row);
    await expect(svc.accrue(input)).resolves.toMatchObject({ created: false });
    expect(prisma.payrollAccrual.create).not.toHaveBeenCalled();
  });

  it('a paid accrual is not canceled', async () => {
    const { svc } = make({ ...row, status: 'paid' });
    await expect(svc.cancel('partner:1', 'refund')).resolves.toBe('paid');
  });

  it('reads fee settings from app_config, with defaults', async () => {
    const { svc } = make(null, { 'payroll.stripe_fee_percent': 0.5 });
    await expect(svc.feeSettings()).resolves.toEqual({
      percent: 0.5,
      fixedCents: 25,
      monthlyCents: 200,
    });
  });

  it('a failing listener does not break the others', async () => {
    const { svc } = make(null);
    const seen: string[] = [];
    svc.onSettled(() => {
      throw new Error('boom');
    });
    svc.onSettled((items, state) => {
      seen.push(`${state}:${items[0].ref}`);
    });
    await svc.settled([{ ref: 'partner:1', payoutId: 'p1' }], 'paid');
    expect(seen).toEqual(['paid:partner:1']);
  });
});
