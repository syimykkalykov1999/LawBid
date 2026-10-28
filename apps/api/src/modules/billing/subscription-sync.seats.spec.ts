import type { ProviderEvent, ProviderSubscription } from './payment-provider';
import { SubscriptionSyncService } from './subscription-sync.service';

/**
 * Owner 2026-10-22: the webhook keeps `assistant_seats` equal to the seat
 * item's quantity on Stripe, except while a removal waits for the period
 * end; a seat purchase's unpaid invoice never makes the subscription
 * past_due; pending_update_applied / _expired settle the purchase.
 */
describe('SubscriptionSyncService seats', () => {
  const future = new Date(Date.now() + 10 * 86_400_000);

  function setup(
    opts: {
      local?: Record<string, unknown>;
      scheduled?: Record<string, unknown> | null;
      seatChange?: Record<string, unknown> | null;
      pending?: Record<string, unknown>[];
      invoice?: Record<string, unknown>;
    } = {},
  ) {
    const local = {
      id: 'row-1',
      user_id: 'att-1',
      stripe_subscription_id: 'sub_1',
      status: 'active',
      plan: 'monthly',
      assistant_seats: 2,
      price_cents: 59_900,
      grace_ends_at: null,
      trial_started_at: null,
      trial_ends_at: null,
      current_period_end: future,
      ...opts.local,
    };
    const updates: Record<string, unknown>[] = [];
    const changeUpdates: Record<string, unknown>[] = [];
    const tx = {
      subscription: {
        findUnique: jest.fn().mockResolvedValue(local),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return Promise.resolve({ ...local, ...data });
        }),
      },
      payment: {
        count: jest.fn().mockResolvedValue(1),
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      assistantSeatChange: {
        findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
          Promise.resolve(
            where.stripe_invoice_id
              ? (opts.seatChange ?? null)
              : (opts.scheduled ?? null),
          ),
        ),
        findMany: jest.fn().mockResolvedValue(opts.pending ?? []),
        update: jest.fn(
          (a: { where: { id: string }; data: Record<string, unknown> }) => {
            changeUpdates.push({ id: a.where.id, ...a.data });
            return Promise.resolve({});
          },
        ),
      },
      stripeCustomer: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const prisma = {
      ...tx,
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const provider = {
      retrieveSubscription: jest.fn(),
      retrieveInvoice: jest.fn().mockResolvedValue({
        id: 'in_1',
        customerId: 'cus_1',
        subscriptionId: 'sub_1',
        amountCents: 5_000,
        currency: 'usd',
        status: 'open',
        paidAt: null,
        paymentIntentId: null,
        failureCode: null,
        ...opts.invoice,
      }),
    };
    const svc = Object.create(
      SubscriptionSyncService.prototype,
    ) as SubscriptionSyncService & Record<string, unknown>;
    Object.assign(svc, {
      prisma,
      provider,
      settings: {
        number: jest.fn().mockResolvedValue(7),
        boolean: jest.fn().mockResolvedValue(true),
      },
      access: { invalidate: jest.fn() },
      notifications: { emit: jest.fn() },
      bids: { withdrawActiveBidsForAttorney: jest.fn() },
      pricing: {
        allSeatPriceIds: jest.fn().mockResolvedValue(['price_seat']),
      },
      logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
    });
    return { svc, updates, changeUpdates, provider, prisma };
  }

  const remote = (seatQty: number | null): ProviderSubscription => ({
    id: 'sub_1',
    customerId: 'cus_1',
    status: 'active',
    trialStart: null,
    trialEnd: null,
    currentPeriodStart: 1,
    currentPeriodEnd: Math.floor(future.getTime() / 1000),
    cancelAtPeriodEnd: false,
    canceledAt: null,
    defaultPaymentMethodId: null,
    metadata: {},
    items: [
      { priceId: 'price_plan', quantity: 1, unitAmountCents: 39_900 },
      ...(seatQty == null
        ? []
        : [
            {
              priceId: 'price_seat',
              quantity: seatQty,
              unitAmountCents: 10_000,
            },
          ]),
    ],
  });

  it('reads the seat quantity from Stripe (a purchase applied after 3DS)', async () => {
    const { svc, updates } = setup();
    await svc.apply(remote(4));
    expect(updates[0]).toMatchObject({
      assistant_seats: 4,
      price_cents: 79_900,
    });
  });

  it('keeps the paid seats while a removal waits for the period end', async () => {
    const { svc, updates } = setup({
      scheduled: { id: 'sch-1', to_seats: 0, effective_at: future },
    });
    await svc.apply(remote(null));
    expect(updates[0]).not.toHaveProperty('assistant_seats');
  });

  it('drops them from the period end and marks the removal applied', async () => {
    const { svc, updates, changeUpdates } = setup({
      scheduled: {
        id: 'sch-1',
        to_seats: 1,
        effective_at: new Date(Date.now() - 1000),
      },
    });
    await svc.apply(remote(1));
    expect(updates[0]).toMatchObject({
      assistant_seats: 1,
      price_cents: 49_900,
    });
    expect(changeUpdates).toContainEqual({ id: 'sch-1', status: 'applied' });
  });

  it('leaves yearly rows and unknown items alone', async () => {
    const yearly = setup({ local: { plan: 'yearly' } });
    await yearly.svc.apply(remote(5));
    expect(yearly.updates[0]).not.toHaveProperty('assistant_seats');
    const none = setup();
    await none.svc.apply(remote(null));
    expect(none.updates[0]).not.toHaveProperty('assistant_seats');
  });

  const event = (type: string, id: string): ProviderEvent => ({
    id: 'evt_1',
    type,
    created: 1,
    object: {
      object: type.startsWith('invoice') ? 'invoice' : 'subscription',
      id,
    },
  });

  it("a seat invoice's failure never makes the subscription past_due", async () => {
    const { svc, updates, changeUpdates, prisma } = setup({
      seatChange: { id: 'chg-1', status: 'pending' },
      invoice: { status: 'open' },
    });
    await svc.handleEvent(event('invoice.payment_failed', 'in_1'));
    expect(changeUpdates).toEqual([{ id: 'chg-1', status: 'failed' }]);
    expect(updates).toEqual([]);
    expect(prisma.payment.upsert).not.toHaveBeenCalled();
  });

  it('a paid seat invoice marks the purchase paid and records the payment', async () => {
    const { svc, changeUpdates, prisma, provider } = setup({
      seatChange: { id: 'chg-1', status: 'pending' },
      invoice: { status: 'paid' },
    });
    provider.retrieveSubscription.mockResolvedValue(remote(3));
    await svc.handleEvent(event('invoice.paid', 'in_1'));
    expect(changeUpdates[0]).toEqual({
      id: 'chg-1',
      status: 'paid',
      amount_cents: 5_000,
    });
    expect(prisma.payment.upsert).toHaveBeenCalled();
  });

  it('pending_update_expired settles waiting purchases from their invoice', async () => {
    const { svc, changeUpdates, provider } = setup({
      pending: [{ id: 'chg-1', status: 'pending', stripe_invoice_id: 'in_1' }],
      invoice: { status: 'void' },
    });
    provider.retrieveSubscription.mockResolvedValue(remote(2));
    await svc.handleEvent(
      event('customer.subscription.pending_update_expired', 'sub_1'),
    );
    expect(changeUpdates).toContainEqual({ id: 'chg-1', status: 'expired' });
    expect(provider.retrieveSubscription).toHaveBeenCalledWith('sub_1');
  });

  it('pending_update_applied marks the purchase paid and syncs the seats', async () => {
    const { svc, changeUpdates, provider, updates } = setup({
      pending: [{ id: 'chg-1', status: 'pending', stripe_invoice_id: 'in_1' }],
      invoice: { status: 'paid' },
    });
    provider.retrieveSubscription.mockResolvedValue(remote(3));
    await svc.handleEvent(
      event('customer.subscription.pending_update_applied', 'sub_1'),
    );
    expect(changeUpdates).toContainEqual({
      id: 'chg-1',
      status: 'paid',
      amount_cents: 5_000,
    });
    expect(updates[0]).toMatchObject({ assistant_seats: 3 });
  });
  it('MONEY M-7: "paid at least once" counts real subscription invoices only', async () => {
    const { svc, prisma } = setup();
    await svc.apply(remote(null));
    expect(prisma.payment.count).toHaveBeenCalledWith({
      where: {
        user_id: 'att-1',
        status: 'succeeded',
        stripe_invoice_id: { not: null },
        amount_cents: { gt: 0 },
      },
    });
  });
});
