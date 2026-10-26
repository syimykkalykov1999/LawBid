import { CaseToolsSweepService } from './case-tools.sweep';
import type { CaseToolsConfig } from './case-tools.settings';

const NOW = new Date('2026-11-10T09:00:00Z');
const cfg = (over: Partial<CaseToolsConfig> = {}): CaseToolsConfig => ({
  invoiceDefaultDueDays: 0,
  invoiceReminderDays: [3, 0],
  invoiceOverdueEveryDays: 7,
  invoiceMaxReminders: 6,
  invoicePayLink: false,
  lateFeePercent: 0,
  lateFeeGraceDays: 5,
  signExpiryDays: 0,
  signReminderEveryDays: 0,
  signMaxReminders: 3,
  signResendCooldownMinutes: 60,
  ...over,
});

const invoice = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  case_id: 'case1',
  attorney_id: 'att',
  client_id: 'cli',
  status: 'sent',
  due_at: new Date('2026-11-01T00:00:00Z'),
  total_cents: 10_000,
  late_fee_cents: 0,
  paid_cents: 0,
  late_fee_applied_at: null,
  reminders_enabled: true,
  reminders_sent: 0,
  last_reminded_at: null,
  ...over,
});

function make(rows: unknown[], config: CaseToolsConfig) {
  const prisma = {
    caseInvoice: {
      findMany: jest.fn().mockResolvedValue(rows),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    paymentRequest: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    caseSignRequest: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    case: { findUnique: jest.fn() },
  };
  const emit = jest.fn().mockResolvedValue(undefined);
  const svc = new CaseToolsSweepService(
    prisma as never,
    { get: () => Promise.resolve(config) } as never,
    { emit } as never,
    { append: jest.fn() } as never,
  );
  return { svc, prisma, emit };
}

describe('case tools sweep: invoices', () => {
  it('does nothing with the defaults and no due dates', async () => {
    const { svc, emit } = make([], cfg());
    expect(await svc.sweepInvoices(NOW)).toEqual({
      overdue: 0,
      lateFees: 0,
      reminded: 0,
    });
    expect(emit).not.toHaveBeenCalled();
  });

  it('marks a past-due invoice overdue and reminds once', async () => {
    const { svc, prisma, emit } = make([invoice()], cfg());
    const r = await svc.sweepInvoices(NOW);
    expect(r.overdue).toBe(1);
    expect(r.reminded).toBe(1);
    expect(prisma.caseInvoice.updateMany.mock.calls[0][0].data).toEqual({
      status: 'overdue',
    });
    expect(emit.mock.calls[0][0].payload.kind).toBe('invoice_overdue');
    expect(emit.mock.calls[0][0].recipientId).toBe('cli');
  });

  it('no late fee while the percent is 0 (default)', async () => {
    const { svc, prisma } = make([invoice()], cfg());
    expect((await svc.sweepInvoices(NOW)).lateFees).toBe(0);
    const writes = prisma.caseInvoice.updateMany.mock.calls.map(
      (c: [{ data: Record<string, unknown> }]) => c[0].data,
    );
    expect(writes.some((d) => 'late_fee_cents' in d)).toBe(false);
  });

  it('adds the late fee once after the grace days and carries it to the pay link', async () => {
    const { svc, prisma } = make(
      [invoice({ status: 'overdue' })],
      cfg({ lateFeePercent: 2 }),
    );
    const r = await svc.sweepInvoices(NOW);
    expect(r.lateFees).toBe(1);
    const feeWrite = prisma.caseInvoice.updateMany.mock.calls.find(
      (c) => 'late_fee_cents' in c[0].data,
    );
    expect(feeWrite?.[0].data.late_fee_cents).toBe(200);
    expect(feeWrite?.[0].where).toEqual({
      id: 'i1',
      late_fee_applied_at: null,
    });
    expect(prisma.paymentRequest.updateMany.mock.calls[0][0].data).toEqual({
      amount_cents: { increment: 200 },
    });
  });

  it('no late fee inside the grace period', async () => {
    const { svc } = make(
      [invoice({ due_at: new Date('2026-11-07T00:00:00Z') })],
      cfg({ lateFeePercent: 2 }),
    );
    expect((await svc.sweepInvoices(NOW)).lateFees).toBe(0);
  });

  it('respects the per-invoice reminders switch', async () => {
    const { svc, emit } = make([invoice({ reminders_enabled: false })], cfg());
    await svc.sweepInvoices(NOW);
    expect(emit).not.toHaveBeenCalled();
  });

  it('a lost claim (another run was first) sends nothing', async () => {
    const { svc, prisma, emit } = make([invoice({ status: 'overdue' })], cfg());
    prisma.caseInvoice.updateMany.mockResolvedValue({ count: 0 });
    await svc.sweepInvoices(NOW);
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('case tools sweep: signing', () => {
  it('does nothing by default', async () => {
    const { svc } = make([], cfg());
    expect(await svc.sweepSigning(NOW)).toEqual({ expired: 0, reminded: 0 });
  });

  it('reminds only the side that has not signed', async () => {
    const { svc, prisma, emit } = make([], cfg({ signReminderEveryDays: 3 }));
    prisma.caseSignRequest.findMany
      .mockResolvedValueOnce([]) // lapsed
      .mockResolvedValueOnce([
        {
          id: 's1',
          case_id: 'case1',
          created_by: 'att',
          created_at: new Date('2026-11-01T00:00:00Z'),
          last_reminded_at: null,
          reminders_sent: 0,
          signatures: [{ signer_id: 'att' }],
        },
      ]);
    prisma.case.findUnique.mockResolvedValue({
      client_id: 'cli',
      accepted_bid: { attorney_id: 'att' },
    });
    const r = await svc.sweepSigning(NOW);
    expect(r.reminded).toBe(1);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0].recipientId).toBe('cli');
    expect(emit.mock.calls[0][0].payload.kind).toBe('sign_reminder');
  });
});
