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
  function make(opts: { enabled?: boolean } = {}) {
    const now = Date.now();
    const prisma = {
      attorneyProfile: {
        findMany: jest.fn().mockResolvedValue([{ user_id: 'u1' }]),
      },
      subscription: {
        findUnique: jest.fn().mockResolvedValue({
          stripe_subscription_id: 'sub_1',
          status: 'active',
          current_period_start: new Date(now - 10 * DAY),
          current_period_end: new Date(now + 20 * DAY),
        }),
      },
      payment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'pay1',
          amount_cents: 30000,
        }),
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
      bidCredit: { findUnique: jest.fn().mockResolvedValue(null) },
      bidPackPurchase: { findMany: jest.fn().mockResolvedValue([]) },
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

  it('does nothing when switched off', async () => {
    const { job, provider } = make({ enabled: false });
    expect((await job.run()).attorneys).toBe(0);
    expect(provider.cancelNow).not.toHaveBeenCalled();
  });
});
