import type { PinoLogger } from 'nestjs-pino';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { OpsStateService } from '../../common/ops/ops-state.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditLogService } from '../admin-access/audit-log.service';
import type {
  AdminPayrollService,
  PayrollAutoDue,
} from '../admin-payroll/admin-payroll.service';
import type { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import type {
  StripeTreasuryState,
  TreasuryStripeService,
} from './treasury-stripe.service';
import { TreasuryService } from './treasury.service';

const SETTINGS: Record<string, number | boolean> = {
  'treasury.auto': true,
  'treasury.payout_day': 25,
  'treasury.buffer_percent': 50,
  'treasury.refund_buffer_usd': 200,
  'treasury.min_profit_usd': 50,
  'treasury.payroll_auto': true,
  'treasury.payroll_day': 1,
  'treasury.payroll_warn_days': 5,
};

interface Row {
  id: string;
  key: string;
  period: string;
  kind: string;
  trigger: string;
  status: string;
}

interface CountWhere {
  period: string;
  kind?: string;
  trigger?: string;
  status?: { notIn: string[] };
}

function make(
  state: StripeTreasuryState | null,
  due: PayrollAutoDue = {
    stripeReady: false,
    employeeIds: [],
    dueCents: 0,
    notLinked: [],
  },
  overrides: Record<string, number | boolean> = {},
) {
  const rows: Row[] = [];
  const prisma = {
    treasuryExpense: {
      findMany: jest.fn(() =>
        Promise.resolve([
          {
            id: 'e1',
            name: 'AWS',
            monthly_cents: 14_000,
            source: 'aws',
            active: true,
            sort: 0,
          },
        ]),
      ),
    },
    payrollEmployee: {
      findMany: jest.fn(() =>
        Promise.resolve([
          { amount_cents: 100_000, stripe_payouts_enabled: false },
        ]),
      ),
    },
    partnerCommission: {
      aggregate: jest.fn(() => Promise.resolve({ _sum: { amount_cents: 0 } })),
    },
    payrollAccrual: {
      aggregate: jest.fn(() => Promise.resolve({ _sum: { amount_cents: 0 } })),
    },
    treasuryPayout: {
      count: jest.fn(({ where }: { where: CountWhere }) =>
        Promise.resolve(
          rows.filter(
            (r) =>
              r.period === where.period &&
              (!where.kind || r.kind === where.kind) &&
              (!where.trigger || r.trigger === where.trigger) &&
              (!where.status || !where.status.notIn.includes(r.status)),
          ).length,
        ),
      ),
      create: jest.fn(({ data }: { data: Omit<Row, 'id' | 'status'> }) => {
        const row: Row = {
          ...data,
          id: `p${rows.length + 1}`,
          status: 'pending',
        };
        rows.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: { status?: string };
        }) => {
          const r = rows.find((x) => x.id === where.id)!;
          if (data.status) r.status = data.status;
          return Promise.resolve(r);
        },
      ),
      findMany: jest.fn(() => Promise.resolve([])),
    },
  };
  const stripe = {
    state: jest.fn(() => Promise.resolve(state)),
    payout: jest.fn(() => Promise.resolve({ id: 'po_1', status: 'pending' })),
    payoutStatus: jest.fn(),
  };
  const kv = new Map<string, string>();
  const redis = {
    set: jest.fn((k: string, v: string, ...args: unknown[]) => {
      if (args.includes('NX') && kv.has(k)) return Promise.resolve(null);
      kv.set(k, v);
      return Promise.resolve('OK');
    }),
    get: jest.fn((k: string) => Promise.resolve(kv.get(k) ?? null)),
    del: jest.fn((k: string) => Promise.resolve(kv.delete(k) ? 1 : 0)),
  };
  const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() };
  const settings = {
    boolean: jest.fn((k: string) =>
      Promise.resolve(overrides[k] ?? SETTINGS[k]),
    ),
    number: jest.fn((k: string) =>
      Promise.resolve(overrides[k] ?? SETTINGS[k]),
    ),
  };
  const ops = {
    cost: jest.fn(() =>
      Promise.resolve({ actualUsd: 90, forecastUsd: 160, limitUsd: 200 }),
    ),
  };
  const flags = { isEnabled: jest.fn(() => Promise.resolve(false)) };
  const payroll = {
    autoDue: jest.fn(() => Promise.resolve(due)),
    payBulk: jest.fn(() =>
      Promise.resolve({
        batchId: 'b1',
        count: due.employeeIds.length,
        totals: { usd: due.dueCents },
        fees: {},
        net: {},
        commissions: {},
        alreadyPaid: [],
        nothingOwed: [],
        failed: [] as string[],
      }),
    ),
  };
  const service = new TreasuryService(
    prisma as unknown as PrismaService,
    stripe as unknown as TreasuryStripeService,
    settings as unknown as AppSettingsService,
    flags as unknown as FeatureFlagsService,
    ops as unknown as OpsStateService,
    { record: jest.fn() } as unknown as AuditLogService,
    payroll as unknown as AdminPayrollService,
    logger as unknown as PinoLogger,
    redis as never,
  );
  return { service, stripe, logger, rows, kv, payroll };
}

const twoBanks = (): StripeTreasuryState => ({
  availableCents: 1_000_000,
  pendingCents: 0,
  payoutInterval: 'manual',
  banks: [
    { id: 'ba_profit', label: 'Chase', last4: '6789', isDefault: true },
    { id: 'ba_costs', label: 'Mercury', last4: '4321', isDefault: false },
  ],
});

const alerts = (logger: { warn: jest.Mock }) =>
  logger.warn.mock.calls
    .map((c: unknown[]) => (c[0] as { alert?: string }).alert)
    .filter(Boolean);

describe('TreasuryService (owner 2026-10-05: profit and reserve)', () => {
  const now = new Date('2026-10-25T15:40:00Z');

  it('sends a month of expenses to the second bank and the profit to the default one', async () => {
    const { service, stripe } = make(twoBanks());
    const res = await service.run('auto', null, now);
    // AWS from its forecast ($160 > $140) + salary by bank $1,000.
    expect(res.expensesCents).toBe(116_000);
    // Reserve: refund $200 + 50 % of (116,000 + 20,000).
    expect(res.profitCents).toBe(1_000_000 - 116_000 - (20_000 + 68_000));
    expect(stripe.payout).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        amountCents: 116_000,
        destination: 'ba_costs',
        idempotencyKey: 'treasury-2026-10:expenses:auto:1',
      }),
    );
    expect(stripe.payout).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        amountCents: res.profitCents,
        destination: undefined, // Stripe's default bank
      }),
    );
  });

  it('runs once a month: the daily tick after the run does nothing', async () => {
    const { service, stripe } = make(twoBanks());
    await service.daily(now);
    expect(stripe.payout).toHaveBeenCalledTimes(2);
    await service.daily(new Date('2026-10-26T15:40:00Z'));
    expect(stripe.payout).toHaveBeenCalledTimes(2);
  });

  it('sends nothing and alerts while Stripe still pays out by itself', async () => {
    const { service, stripe, logger } = make({
      ...twoBanks(),
      payoutInterval: 'daily',
    });
    const res = await service.run('auto', null, now);
    expect(res.skipped).toBe('not_manual');
    expect(stripe.payout).not.toHaveBeenCalled();
    expect(alerts(logger)).toContain('treasury_setup_needed');
  });

  it('a short balance pays the bills first and alerts', async () => {
    const { service, stripe, logger } = make({
      ...twoBanks(),
      availableCents: 50_000,
    });
    const res = await service.run('auto', null, now);
    expect(res.expensesCents).toBe(50_000);
    expect(res.profitCents).toBe(0);
    expect(stripe.payout).toHaveBeenCalledTimes(1);
    expect(alerts(logger)).toContain('treasury_low');
  });

  it('a failed payout is recorded and alerted', async () => {
    const { service, stripe, logger, rows } = make(twoBanks());
    stripe.payout.mockImplementationOnce(() =>
      Promise.reject(new Error('Insufficient funds')),
    );
    await service.run('auto', null, now);
    expect(rows[0].status).toBe('failed');
    expect(alerts(logger)).toContain('treasury_payout_failed');
  });

  it('a second split at the same time is refused (busy)', async () => {
    const { service, kv } = make(twoBanks());
    kv.set('treasury:run:lock', '1');
    expect((await service.run('manual', 'admin', now)).skipped).toBe('busy');
  });

  it('a change of the banks in Stripe is alerted on the next day', async () => {
    const state = twoBanks();
    const { service, logger } = make(state);
    await service.daily(new Date('2026-10-05T15:40:00Z'));
    expect(alerts(logger)).not.toContain('treasury_bank_changed');
    state.banks!.push({
      id: 'ba_new',
      label: 'Unknown',
      last4: '0000',
      isDefault: false,
    });
    await service.daily(new Date('2026-10-06T15:40:00Z'));
    expect(alerts(logger)).toContain('treasury_bank_changed');
  });
});

describe('TreasuryService payroll pay day (owner 2026-10-06)', () => {
  const ready: PayrollAutoDue = {
    stripeReady: true,
    employeeIds: ['emp-1', 'emp-2'],
    dueCents: 300_000,
    notLinked: [],
  };
  const payDay = new Date('2026-11-01T15:40:00Z');

  it('pays the linked people through Stripe on the pay day, once', async () => {
    const { service, payroll } = make(twoBanks(), ready);
    await service.daily(payDay);
    expect(payroll.payBulk).toHaveBeenCalledWith(null, {
      employeeIds: ['emp-1', 'emp-2'],
      period: '2026-11',
      method: 'stripe',
      note: 'Авто',
    });
    await service.daily(new Date('2026-11-02T15:40:00Z'));
    expect(payroll.payBulk).toHaveBeenCalledTimes(1);
  });

  it('sends nothing and alerts when Stripe holds less than the salaries; pays the next day', async () => {
    const short = make({ ...twoBanks(), availableCents: 100_000 }, ready);
    await short.service.daily(payDay);
    expect(short.payroll.payBulk).not.toHaveBeenCalled();
    expect(alerts(short.logger)).toContain('payroll_funds_low');
    // The money arrived: the missed pay day runs on the next tick.
    const res = await short.service.payrollDaily(
      500_000,
      new Date('2026-11-02T15:40:00Z'),
    );
    expect(res).toEqual({ paid: 2, failed: 0 });
  });

  it('warns once, days before the pay day, when the money will not be enough', async () => {
    const { service, logger, payroll } = make(
      { ...twoBanks(), availableCents: 100_000 },
      ready,
      { 'treasury.payroll_day': 5 },
    );
    const before = new Date('2026-11-01T15:40:00Z'); // 4 days before the 5th
    await service.payrollDaily(100_000, before);
    await service.payrollDaily(100_000, new Date('2026-11-02T15:40:00Z'));
    expect(
      alerts(logger).filter((a) => a === 'payroll_funds_low'),
    ).toHaveLength(1);
    expect(payroll.payBulk).not.toHaveBeenCalled();
    // Far from the pay day: nothing checked.
    const early = make(twoBanks(), ready, { 'treasury.payroll_day': 28 });
    await early.service.payrollDaily(0, before);
    expect(early.payroll.autoDue).not.toHaveBeenCalled();
  });

  it('does nothing with «авто» off', async () => {
    const { service, payroll } = make(twoBanks(), ready, {
      'treasury.payroll_auto': false,
    });
    expect(await service.payrollDaily(1_000_000, payDay)).toEqual({
      skipped: 'manual_mode',
    });
    expect(payroll.autoDue).not.toHaveBeenCalled();
  });

  it('alerts when Stripe refuses a salary transfer', async () => {
    const { service, payroll, logger } = make(twoBanks(), ready);
    payroll.payBulk.mockResolvedValueOnce({
      batchId: 'b1',
      count: 1,
      totals: { usd: 100_000 },
      fees: {},
      net: {},
      commissions: {},
      alreadyPaid: [],
      nothingOwed: [],
      failed: ['emp-2'],
    });
    await service.payrollDaily(1_000_000, payDay);
    expect(alerts(logger)).toContain('payroll_auto_failed');
  });
});
