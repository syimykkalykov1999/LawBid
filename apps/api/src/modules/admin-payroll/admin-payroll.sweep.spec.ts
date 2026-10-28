import { AdminPayrollService } from './admin-payroll.service';

/**
 * Algo audit 2026-10-27 (MONEY H-7): payouts left `processing` by a crash
 * are re-sent with the SAME idempotency key; (M-8) a canceled paid payout
 * reverses its ledger entry.
 */
describe('AdminPayrollService stuck payouts and cancel', () => {
  const now = new Date('2026-11-01T12:00:00Z');
  const ago = (min: number) => new Date(now.getTime() - min * 60_000);
  const employee = {
    id: 'emp-1',
    name: 'Ann',
    stripe_account_id: 'acct_1',
    currency: 'usd',
  };
  const payout = (id: string, created: Date, extra = {}) => ({
    id,
    employee_id: 'emp-1',
    employee,
    status: 'processing',
    method: 'stripe',
    amount_cents: 100_000,
    base_cents: 100_000,
    commission_cents: 0,
    fee_cents: 250,
    net_cents: 99_750,
    currency: 'usd',
    period: '2026-11',
    transfer_id: null,
    created_at: created,
    ...extra,
  });

  function setup(rows: ReturnType<typeof payout>[], transferFails = false) {
    const updates: { id: string; data: Record<string, unknown> }[] = [];
    const tx = {
      payrollPayout: {
        update: jest.fn(
          (a: { where: { id: string }; data: Record<string, unknown> }) => {
            updates.push({ id: a.where.id, data: a.data });
            return Promise.resolve({ ...rows[0], ...a.data });
          },
        ),
      },
      payrollAccrual: { updateMany: jest.fn() },
    };
    const prisma = {
      ...tx,
      payrollPayout: {
        ...tx.payrollPayout,
        findMany: jest.fn().mockResolvedValue(rows),
        findUnique: jest.fn().mockResolvedValue(rows[0]),
      },
      payrollAccrual: {
        ...tx.payrollAccrual,
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'acc-1', payout_id: rows[0]?.id, event_ref: 'ref-1' },
          ]),
      },
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (t: typeof tx) => unknown)(tx)
          : Promise.all(arg as unknown[]),
      ),
    };
    const stripe = {
      transfer: transferFails
        ? jest.fn().mockRejectedValue(new Error('declined'))
        : jest.fn().mockResolvedValue('tr_1'),
      reverse: jest.fn().mockResolvedValue(undefined),
    };
    const accruals = { settled: jest.fn() };
    const ledger = { expensePaid: jest.fn(), expenseReversed: jest.fn() };
    const audit = { record: jest.fn() };
    const svc = new AdminPayrollService(
      prisma as never,
      audit as never,
      stripe as never,
      accruals as never,
      undefined,
      ledger as never,
    );
    return { svc, prisma, stripe, accruals, ledger, updates };
  }

  it('re-sends a stuck payout with its own idempotency key and marks it paid', async () => {
    const h = setup([payout('po-1', ago(45))]);
    const res = await h.svc.sweepStuck(30, now);
    expect(res).toEqual({ resent: 1, failed: 0, tooOld: [] });
    expect(h.stripe.transfer).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acct_1',
        amountCents: 99_750,
        idempotencyKey: 'payroll-po-1',
      }),
    );
    expect(h.updates[0]).toEqual({
      id: 'po-1',
      data: { status: 'paid', transfer_id: 'tr_1' },
    });
    expect(h.accruals.settled).toHaveBeenCalledWith(
      [{ ref: 'ref-1', payoutId: 'po-1' }],
      'paid',
    );
    expect(h.prisma.payrollPayout.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'processing',
          method: 'stripe',
          created_at: { lt: ago(30) },
        },
      }),
    );
  });

  it('never re-sends past the 24 h idempotency window (could pay twice)', async () => {
    const h = setup([payout('po-old', ago(24 * 60))]);
    const res = await h.svc.sweepStuck(30, now);
    expect(res).toEqual({ resent: 0, failed: 0, tooOld: ['po-old'] });
    expect(h.stripe.transfer).not.toHaveBeenCalled();
  });

  it('a refused re-send marks the payout failed (owed again)', async () => {
    const h = setup([payout('po-1', ago(45))], true);
    const res = await h.svc.sweepStuck(30, now);
    expect(res).toEqual({ resent: 0, failed: 1, tooOld: [] });
    expect(h.updates[0].data).toMatchObject({ status: 'failed' });
  });

  it('0 minutes = off', async () => {
    const h = setup([payout('po-1', ago(45))]);
    expect(await h.svc.sweepStuck(0, now)).toEqual({
      resent: 0,
      failed: 0,
      tooOld: [],
    });
    expect(h.prisma.payrollPayout.findMany).not.toHaveBeenCalled();
  });

  it('M-8: canceling a paid Stripe payout reverses its ledger entry', async () => {
    const h = setup([
      payout('po-1', ago(60), { status: 'paid', transfer_id: 'tr_1' }),
    ]);
    await h.svc.cancel(
      { id: 'adm-1', ip: '127.0.0.1' } as never,
      'po-1',
      'mistake',
    );
    expect(h.stripe.reverse).toHaveBeenCalledWith(
      'tr_1',
      'payroll-reverse-po-1',
    );
    expect(h.ledger.expenseReversed).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sourceType: 'payroll_payout',
        sourceId: 'po-1',
        stripeRef: 'tr_1',
      }),
    );
  });
});
