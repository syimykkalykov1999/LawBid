import { SubscriptionSyncService } from './subscription-sync.service';

/**
 * Algo audit 2026-10-27 (MONEY H-1): a late `invoice.payment_failed` (the
 * card was retried and the invoice got paid in between, or the events
 * arrived out of order) must not turn a paid invoice into a `failed`
 * payment and the subscription into past_due with a grace period.
 */
describe('SubscriptionSyncService.onInvoice — paid is what the invoice says', () => {
  function setup(opts: {
    invoiceStatus: 'paid' | 'open';
    existing?: { status: string } | null;
  }) {
    const local = {
      id: 'row-1',
      user_id: 'att-1',
      stripe_subscription_id: 'sub_1',
      status: 'active',
      grace_ends_at: null,
    };
    const upserts: Record<string, unknown>[] = [];
    const subUpdates: Record<string, unknown>[] = [];
    const tx = {
      payment: {
        upsert: jest.fn((a: { create: Record<string, unknown> }) => {
          upserts.push(a.create);
          return Promise.resolve({ id: 'pay-1', ...a.create });
        }),
      },
    };
    const prisma = {
      ...tx,
      subscription: {
        findUnique: jest.fn().mockResolvedValue(local),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          subUpdates.push(data);
          return Promise.resolve({ ...local, ...data });
        }),
      },
      payment: {
        ...tx.payment,
        findUnique: jest.fn().mockResolvedValue(opts.existing ?? null),
      },
      assistantSeatChange: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const notifications = { emit: jest.fn().mockResolvedValue(undefined) };
    const access = { invalidate: jest.fn() };
    const provider = {
      // A paid invoice re-syncs the subscription; "not found" ends it here.
      retrieveSubscription: jest.fn().mockResolvedValue(null),
      retrieveInvoice: jest.fn().mockResolvedValue({
        id: 'in_1',
        customerId: 'cus_1',
        subscriptionId: 'sub_1',
        amountCents: 39_900,
        currency: 'usd',
        status: opts.invoiceStatus,
        paidAt: opts.invoiceStatus === 'paid' ? 1_700_000_000 : null,
        paymentIntentId: 'pi_1',
        failureCode: opts.invoiceStatus === 'paid' ? null : 'card_declined',
      }),
    };
    const svc = Object.create(SubscriptionSyncService.prototype) as {
      onInvoice(invoiceId: string, type: string): Promise<void>;
    };
    Object.assign(svc, {
      prisma,
      provider,
      settings: { number: jest.fn().mockResolvedValue(3) },
      access,
      notifications,
      logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
    });
    return { svc, upserts, subUpdates, notifications, access };
  }

  it('a plain failure: payment failed, past_due + grace, the attorney told', async () => {
    const h = setup({ invoiceStatus: 'open' });
    await h.svc.onInvoice('in_1', 'invoice.payment_failed');
    expect(h.upserts[0]).toMatchObject({ status: 'failed' });
    expect(h.subUpdates[0]).toMatchObject({ status: 'past_due' });
    expect(h.notifications.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'subscription_payment_failed' }),
    );
  });

  it('a late payment_failed for an invoice Stripe now says is PAID books a success, no past_due', async () => {
    const h = setup({ invoiceStatus: 'paid' });
    await h.svc.onInvoice('in_1', 'invoice.payment_failed');
    expect(h.upserts[0]).toMatchObject({ status: 'succeeded' });
    expect(h.subUpdates).toHaveLength(0);
    expect(h.notifications.emit).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'subscription_payment_failed' }),
    );
  });

  it('a late payment_failed never downgrades a payment already succeeded locally', async () => {
    const h = setup({
      invoiceStatus: 'open',
      existing: { status: 'succeeded' },
    });
    await h.svc.onInvoice('in_1', 'invoice.payment_failed');
    expect(h.upserts).toHaveLength(0);
    expect(h.subUpdates).toHaveLength(0);
    expect(h.access.invalidate).not.toHaveBeenCalled();
  });
});
