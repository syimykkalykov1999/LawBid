import {
  unusedShare,
  VerificationLossBillingJob,
} from './verification-loss-billing.job';

describe('unusedShare', () => {
  it('is the part of the amount that was not used, never more than paid', () => {
    expect(unusedShare(39900, 15, 30)).toBe(19950);
    expect(unusedShare(39900, 0, 30)).toBe(0);
    expect(unusedShare(39900, 40, 30)).toBe(39900);
    expect(unusedShare(0, 5, 10)).toBe(0);
    expect(unusedShare(1000, 5, 0)).toBe(0);
  });
});

describe('VerificationLossBillingJob', () => {
  const DAY = 86_400_000;
  // A frozen clock: the unused share must not depend on milliseconds.
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-16T12:00:00Z') });
  });
  afterEach(() => {
    jest.useRealTimers();
  });
  function make(
    opts: {
      enabled?: boolean;
      payments?: Record<string, unknown>[];
      seatInvoices?: string[];
      credit?: { balance: number } | null;
      purchases?: Record<string, unknown>[];
      lost?: string[];
    } = {},
  ) {
    const now = Date.now();
    const prisma = {
      attorneyProfile: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            (opts.lost ?? ['u1']).map((user_id) => ({ user_id })),
          ),
      },
      subscription: {
        // 13.11: the set-based pre-check (u1 has a live Stripe subscription).
        findMany: jest.fn().mockResolvedValue([{ user_id: 'u1' }]),
        findUnique: jest.fn().mockResolvedValue({
          stripe_subscription_id: 'sub_1',
          status: 'active',
          current_period_start: new Date(now - 10 * DAY),
          current_period_end: new Date(now + 20 * DAY),
        }),
      },
      payment: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            opts.payments ?? [
              { id: 'pay1', amount_cents: 30000, stripe_invoice_id: 'in_1' },
            ],
          ),
        findUnique: jest.fn().mockResolvedValue({
          id: 'pay1',
          user_id: 'u1',
          amount_cents: 30000,
          stripe_payment_intent_id: 'pi_1',
        }),
      },
      refund: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount_cents: 0 } }),
        create: jest.fn().mockResolvedValue({ id: 'r1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      casePromotion: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      bidCredit: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            opts.credit && opts.credit.balance > 0 ? [{ user_id: 'u1' }] : [],
          ),
        findUnique: jest.fn().mockResolvedValue(opts.credit ?? null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      bidPackPurchase: {
        findMany: jest.fn().mockResolvedValue(opts.purchases ?? []),
      },
      assistantSeatChange: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            (opts.seatInvoices ?? []).map((i) => ({ stripe_invoice_id: i })),
          ),
      },
    };
    const provider = {
      name: 'stripe',
      cancelNow: jest.fn().mockResolvedValue({ id: 'sub_1' }),
      refund: jest.fn().mockResolvedValue({
        id: 're_1',
        status: 'succeeded',
        failureReason: null,
      }),
    };
    const sync = { apply: jest.fn().mockResolvedValue(null) };
    const settings = {
      boolean: jest.fn().mockResolvedValue(opts.enabled ?? true),
    };
    const logger = { setContext: jest.fn(), info: jest.fn(), error: jest.fn() };
    const job = new VerificationLossBillingJob(
      prisma as never,
      settings as never,
      sync as never,
      provider as never,
      logger as never,
    );
    return { job, prisma, provider, sync };
  }

  it('cancels the subscription now and refunds the unused two thirds of the period', async () => {
    const { job, provider, sync } = make();
    const out = await job.run();
    expect(provider.cancelNow).toHaveBeenCalledWith('sub_1');
    expect(sync.apply).toHaveBeenCalled();
    expect(provider.refund).toHaveBeenCalledWith(
      expect.objectContaining({ paymentIntentId: 'pi_1', amountCents: 20000 }),
    );
    expect(out).toMatchObject({
      attorneys: 1,
      subscriptionsCanceled: 1,
      refundedCents: 20000,
    });
  });

  it('reads per attorney only those with something to stop, in set-based batches (13.11, 1B load test)', async () => {
    // 2 001 lost attorneys; only u1 (a live subscription) has anything.
    const lost = [...Array.from({ length: 2000 }, (_, i) => `idle-${i}`), 'u1'];
    const { job, prisma, provider } = make({ lost });
    const out = await job.run();
    // Three reads per 1 000 attorneys, not four per attorney.
    expect(prisma.subscription.findMany).toHaveBeenCalledTimes(3);
    expect(prisma.bidCredit.findMany).toHaveBeenCalledTimes(3);
    expect(prisma.subscription.findMany.mock.calls[0][0]).toEqual({
      where: {
        user_id: { in: lost.slice(0, 1000) },
        stripe_subscription_id: { not: null },
        status: { in: ['active', 'trialing', 'past_due'] },
      },
      select: { user_id: true },
    });
    expect(prisma.casePromotion.findMany.mock.calls[0][0].where).toEqual({
      user_id: { in: lost.slice(0, 1000) },
      status: { in: ['active', 'paused', 'pending_review'] },
    });
    expect(prisma.bidCredit.findMany.mock.calls[0][0].where).toEqual({
      user_id: { in: lost.slice(0, 1000) },
      balance: { gt: 0 },
    });
    expect(prisma.subscription.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.bidCredit.findUnique).toHaveBeenCalledTimes(1);
    expect(provider.cancelNow).toHaveBeenCalledTimes(1);
    expect(out.attorneys).toBe(1);
  });

  it('does nothing when switched off', async () => {
    const { job, provider } = make({ enabled: false });
    expect((await job.run()).attorneys).toBe(0);
    expect(provider.cancelNow).not.toHaveBeenCalled();
  });
  it('MONEY M-1: the base is the last renewal, not a seat-purchase invoice', async () => {
    const { job, provider } = make({
      payments: [
        { id: 'seat', amount_cents: 3000, stripe_invoice_id: 'in_seat' },
        { id: 'pay1', amount_cents: 30000, stripe_invoice_id: 'in_1' },
      ],
      seatInvoices: ['in_seat'],
    });
    await job.run();
    expect(provider.refund).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 20000 }),
    );
  });

  it('MONEY M-1: offers spent meanwhile never push the balance below zero', async () => {
    const { job, prisma } = make({
      credit: { balance: 5 },
      purchases: [
        { id: 'bp1', bids: 10, price_cents: 1500, payment_id: 'pay1' },
      ],
    });
    await job.run();
    expect(prisma.bidCredit.updateMany).toHaveBeenNthCalledWith(1, {
      where: { user_id: 'u1', balance: { gte: 5 } },
      data: { balance: { decrement: 5 } },
    });
    // The guarded decrement found less (count 0): the rest is zeroed.
    expect(prisma.bidCredit.updateMany).toHaveBeenNthCalledWith(2, {
      where: { user_id: 'u1', balance: { gt: 0 } },
      data: { balance: 0 },
    });
  });
});
