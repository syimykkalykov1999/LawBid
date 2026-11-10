import { NotFoundException } from '@nestjs/common';
import { CaseBillingService } from './case-billing.service';

/**
 * Security audit 2026-11-08 (L9): billing rows are found by case AND
 * attorney. If a case ever passes to a new attorney, the new attorney must
 * not edit or delete the time, expenses or invoices of the one before.
 */
const OLD = 'attorney-old';
const NEW = 'attorney-new';

/** A prisma stub that filters like the database would. */
function rowStore<T extends { attorney_id: string }>(row: T) {
  return jest.fn((args: { where: Record<string, unknown> }) =>
    Promise.resolve(
      args.where.attorney_id === undefined ||
        args.where.attorney_id === row.attorney_id
        ? row
        : null,
    ),
  );
}

function make() {
  const prisma = {
    caseTimeEntry: {
      findFirst: rowStore({
        id: 'e1',
        case_id: 'k1',
        attorney_id: OLD,
        invoice_id: null,
        running_since: null,
      }),
      update: jest.fn(() => Promise.resolve({})),
    },
    caseExpense: {
      findFirst: rowStore({ id: 'x1', case_id: 'k1', attorney_id: OLD }),
      update: jest.fn(() => Promise.resolve({})),
    },
    caseInvoice: {
      findFirst: rowStore({
        id: 'i1',
        case_id: 'k1',
        attorney_id: OLD,
        status: 'sent',
      }),
    },
  };
  const ws = {
    side: jest.fn(() =>
      Promise.resolve({
        role: 'attorney',
        attorneyId: NEW,
        clientId: 'client-1',
        writable: true,
      }),
    ),
  };
  const svc = new CaseBillingService(
    prisma as never,
    ws as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { svc, prisma };
}

const newAttorney = { sub: NEW, role: 'attorney' } as never;

describe('CaseBillingService rows of another attorney (audit L9)', () => {
  it('time of the attorney before is not found, nothing is deleted', async () => {
    const m = make();
    await expect(
      m.svc.deleteTime(newAttorney, 'k1', 'e1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(m.prisma.caseTimeEntry.update).not.toHaveBeenCalled();
  });

  it('nor an expense', async () => {
    const m = make();
    await expect(
      m.svc.deleteExpense(newAttorney, 'k1', 'x1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(m.prisma.caseExpense.update).not.toHaveBeenCalled();
  });

  it('nor an invoice', async () => {
    const m = make();
    await expect(
      m.svc.remindInvoice(newAttorney, 'k1', 'i1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
