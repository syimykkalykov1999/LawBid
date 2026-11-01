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

/** Algo audit 2026-10-27 (MONEY H-2): a paid invoice that arrives before
 * the local subscription row exists is retried, not dropped. */
describe('SubscriptionSyncService.onInvoice — no local subscription yet', () => {
  function setup(opts: {
    status?: 'paid' | 'open';
    badge?: boolean;
    plan?: boolean;
    enabled?: boolean;
  }) {
    const prisma = {
      subscription: { findUnique: jest.fn().mockResolvedValue(null) },
      // Algo audit M-4: the customer has no attorney row (not a duplicate).
      stripeCustomer: { findUnique: jest.fn().mockResolvedValue(null) },
      clientVerification: {
        findUnique: jest
          .fn()
          .mockResolvedValue(opts.badge ? { id: 'cv-1' } : null),
      },
      clientSubscription: {
        findUnique: jest
          .fn()
          .mockResolvedValue(opts.plan ? { id: 'cs-1' } : null),
      },
      payment: { upsert: jest.fn() },
    };
    const provider = {
      retrieveInvoice: jest.fn().mockResolvedValue({
        id: 'in_9',
        customerId: 'cus_9',
        subscriptionId: 'sub_9',
        amountCents: 39_900,
        currency: 'usd',
        status: opts.status ?? 'paid',
        paidAt: 1_700_000_000,
        paymentIntentId: 'pi_9',
        failureCode: null,
      }),
    };
    const svc = Object.create(SubscriptionSyncService.prototype) as {
      onInvoice(invoiceId: string, type: string): Promise<void>;
    };
    Object.assign(svc, {
      prisma,
      provider,
      settings: {
        number: jest.fn().mockResolvedValue(3),
        boolean: jest.fn().mockResolvedValue(opts.enabled ?? true),
      },
      logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
    });
    return { svc, prisma };
  }

  it('a paid invoice of an unknown attorney subscription throws (the runner retries)', async () => {
    const h = setup({});
    await expect(h.svc.onInvoice('in_9', 'invoice.paid')).rejects.toThrow(
      /no local row yet/,
    );
    expect(h.prisma.payment.upsert).not.toHaveBeenCalled();
  });

  it("a client's badge or plan subscription is not ours: no retry", async () => {
    await expect(
      setup({ badge: true }).svc.onInvoice('in_9', 'invoice.paid'),
    ).resolves.toBeUndefined();
    await expect(
      setup({ plan: true }).svc.onInvoice('in_9', 'invoice.paid'),
    ).resolves.toBeUndefined();
  });

  it('an unpaid invoice or the switch off: dropped as before', async () => {
    await expect(
      setup({ status: 'open' }).svc.onInvoice('in_9', 'invoice.payment_failed'),
    ).resolves.toBeUndefined();
    await expect(
      setup({ enabled: false }).svc.onInvoice('in_9', 'invoice.paid'),
    ).resolves.toBeUndefined();
  });
});

/** Algo audit 2026-10-27 (MONEY M-2): a partial refund reaches the ledger. */
describe('SubscriptionSyncService.onRefund — partial refunds', () => {
  function setup(opts: { refunded: boolean; enabled?: boolean }) {
    const tx = {};
    const prisma = {
      payment: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'pay-1', user_id: 'att-1' }]),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const ledger = { paymentRefundSynced: jest.fn() };
    const bidPacks = { refundPayments: jest.fn() };
    const stars = { refundPayments: jest.fn() };
    const svc = Object.create(SubscriptionSyncService.prototype) as {
      onRefund(chargeId: string): Promise<void>;
    };
    Object.assign(svc, {
      prisma,
      ledger,
      bidPacks,
      stars,
      provider: {
        retrieveCharge: jest.fn().mockResolvedValue({
          id: 'ch_1',
          paymentIntentId: 'pi_1',
          refunded: opts.refunded,
          amountRefundedCents: 5_000,
        }),
      },
      settings: { boolean: jest.fn().mockResolvedValue(opts.enabled ?? true) },
      logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
    });
    return { svc, prisma, ledger, bidPacks, stars };
  }

  it('books the refunded part, keeps the payment succeeded, takes nothing back', async () => {
    const h = setup({ refunded: false });
    await h.svc.onRefund('ch_1');
    expect(h.ledger.paymentRefundSynced).toHaveBeenCalledWith(
      expect.anything(),
      { paymentId: 'pay-1', userId: 'att-1', totalRefundedCents: 5_000 },
    );
    expect(h.prisma.payment.updateMany).not.toHaveBeenCalled();
    expect(h.bidPacks.refundPayments).not.toHaveBeenCalled();
    expect(h.stars.refundPayments).not.toHaveBeenCalled();
  });

  it('switch off: a partial refund is ignored as before', async () => {
    const h = setup({ refunded: false, enabled: false });
    await h.svc.onRefund('ch_1');
    expect(h.ledger.paymentRefundSynced).not.toHaveBeenCalled();
  });
});
