import { reconcileInvoicePayment } from './invoice-reconcile';

function tx(invoice: Record<string, unknown> | null, invoiceId: string | null) {
  const update = jest.fn();
  return {
    update,
    tx: {
      paymentRequest: {
        findUnique: jest.fn().mockResolvedValue({ invoice_id: invoiceId }),
      },
      caseInvoice: {
        findUnique: jest.fn().mockResolvedValue(invoice),
        update,
      },
    } as never,
  };
}

const inv = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  status: 'sent',
  total_cents: 10_000,
  late_fee_cents: 0,
  paid_cents: 0,
  paid_at: null,
  ...over,
});

describe('reconcileInvoicePayment', () => {
  const now = new Date('2026-11-01T00:00:00Z');

  it('a plain request (no invoice) is untouched', async () => {
    const t = tx(null, null);
    await reconcileInvoicePayment(t.tx, 'r1', 5000, now);
    expect(t.update).not.toHaveBeenCalled();
  });

  it('a full payment makes the invoice paid', async () => {
    const t = tx(inv(), 'i1');
    await reconcileInvoicePayment(t.tx, 'r1', 10_000, now);
    expect(t.update.mock.calls[0][0].data).toEqual({
      paid_cents: 10_000,
      status: 'paid',
      paid_at: now,
    });
  });

  it('a part payment makes it partially paid', async () => {
    const t = tx(inv(), 'i1');
    await reconcileInvoicePayment(t.tx, 'r1', 4000, now);
    expect(t.update.mock.calls[0][0].data.status).toBe('partially_paid');
    expect(t.update.mock.calls[0][0].data.paid_at).toBeNull();
  });

  it('the second part completes it', async () => {
    const t = tx(inv({ status: 'partially_paid', paid_cents: 4000 }), 'i1');
    await reconcileInvoicePayment(t.tx, 'r1', 6000, now);
    expect(t.update.mock.calls[0][0].data.status).toBe('paid');
  });

  it('an overdue invoice with a late fee is not paid by the base amount', async () => {
    const t = tx(inv({ status: 'overdue', late_fee_cents: 500 }), 'i1');
    await reconcileInvoicePayment(t.tx, 'r1', 10_000, now);
    expect(t.update.mock.calls[0][0].data.status).toBe('partially_paid');
  });

  it('a void invoice is left alone', async () => {
    const t = tx(inv({ status: 'void' }), 'i1');
    await reconcileInvoicePayment(t.tx, 'r1', 10_000, now);
    expect(t.update).not.toHaveBeenCalled();
  });
});
