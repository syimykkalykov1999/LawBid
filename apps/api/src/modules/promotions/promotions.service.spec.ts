import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import type {
  PaymentProvider,
  ProviderCheckoutSession,
} from '../billing/payment-provider';
import type { ReferralsService } from '../referrals/referrals.service';
import { PromotionsService } from './promotions.service';
import {
  DEFAULT_PROMOTION_SETTINGS,
  parsePromotionSettings,
  quotePromotion,
} from './promotions.settings';

const DAY = 86_400_000;

function setup(opts: { enabled?: boolean; credits?: number } = {}) {
  const prisma = {
    appConfig: {
      findUnique: jest.fn().mockResolvedValue({
        value: { ...DEFAULT_PROMOTION_SETTINGS, enabled: opts.enabled ?? true },
      }),
    },
    case: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'c1',
        client_id: 'owner',
        status: 'open',
        deleted_at: null,
      }),
    },
    casePromotion: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'p1',
          impressions: 0,
          created_at: new Date(),
          stripe_checkout_id: null,
          payment_id: null,
          ...data,
        }),
      ),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'p1',
          case_id: 'c1',
          days: 3,
          price_cents_per_day: 1000,
          total_cents: 3000,
          status: 'pending_payment',
          starts_at: null,
          ends_at: null,
          impressions: 0,
          created_at: new Date(),
          ...data,
        }),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    payment: { create: jest.fn().mockResolvedValue({ id: 'pay1' }) },
    report: { count: jest.fn().mockResolvedValue(0) },
    post: { findUnique: jest.fn().mockResolvedValue(null) },
    user: { findUnique: jest.fn().mockResolvedValue({ email: 'c@x.io' }) },
    promoCode: { findUnique: jest.fn(), update: jest.fn() },
    promoRedemption: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
  );
  const referrals = {
    promotionCreditDays: jest.fn().mockResolvedValue(opts.credits ?? 0),
    consumePromotionCredits: jest.fn(
      (_tx: unknown, _u: string, _p: string, days: number) =>
        Promise.resolve(days),
    ),
    restorePromotionCredits: jest.fn().mockResolvedValue(0),
  };
  const provider = {
    createOneTimeCheckout: jest
      .fn()
      .mockResolvedValue({ id: 'cs_1', url: 'https://pay/cs_1' }),
    retrieveCheckoutSession: jest.fn(),
  };
  const config = { get: jest.fn() } as unknown as ConfigService;
  const service = new PromotionsService(
    prisma as unknown as PrismaService,
    config,
    referrals as unknown as ReferralsService,
    provider as unknown as PaymentProvider,
  );
  return { prisma, referrals, provider, service };
}

describe('quotePromotion', () => {
  it('half a credit day pays for the other half (owner 2026-10-05)', () => {
    const q = quotePromotion({
      days: 1,
      priceCentsPerDay: 999,
      creditDaysAvailable: 0.5,
      useCredits: true,
    });
    expect(q.creditDaysUsed).toBe(0.5);
    expect(q.totalCents).toBe(500);
    expect(Number.isInteger(q.totalCents)).toBe(true);
  });

  it('days × price, credits first', () => {
    expect(
      quotePromotion({
        days: 3,
        priceCentsPerDay: 1000,
        creditDaysAvailable: 1,
        useCredits: true,
      }),
    ).toEqual({
      days: 3,
      priceCentsPerDay: 1000,
      grossCents: 3000,
      creditDaysUsed: 1,
      promoDiscountCents: 0,
      totalCents: 2000,
    });
  });

  it('credits can be declined and never exceed the days', () => {
    const base = { days: 2, priceCentsPerDay: 1000, creditDaysAvailable: 5 };
    expect(quotePromotion({ ...base, useCredits: false }).totalCents).toBe(
      2000,
    );
    const all = quotePromotion({ ...base, useCredits: true });
    expect(all.creditDaysUsed).toBe(2);
    expect(all.totalCents).toBe(0);
  });

  it('applies percent / amount / free-days codes after credits', () => {
    const base = {
      days: 4,
      priceCentsPerDay: 1000,
      creditDaysAvailable: 1,
      useCredits: true,
    };
    const promo = {
      id: 'x',
      percentOff: null,
      amountOffCents: null,
      freeDays: null,
    };
    expect(
      quotePromotion({
        ...base,
        promo: { ...promo, discountType: 'percent', percentOff: 50 },
      }).totalCents,
    ).toBe(1500);
    expect(
      quotePromotion({
        ...base,
        promo: { ...promo, discountType: 'amount', amountOffCents: 5000 },
      }).totalCents,
    ).toBe(0);
    expect(
      quotePromotion({
        ...base,
        promo: { ...promo, discountType: 'free_days', freeDays: 2 },
      }).totalCents,
    ).toBe(1000);
  });

  it('a tiny non-zero charge is raised to the Stripe minimum', () => {
    const q = quotePromotion({
      days: 1,
      priceCentsPerDay: 1000,
      creditDaysAvailable: 0,
      useCredits: true,
      promo: {
        id: 'x',
        discountType: 'percent',
        percentOff: 99,
        amountOffCents: null,
        freeDays: null,
      },
    });
    expect(q.totalCents).toBe(50);
  });

  it('settings fall back to defaults', () => {
    expect(parsePromotionSettings(undefined)).toEqual(
      DEFAULT_PROMOTION_SETTINGS,
    );
    expect(
      parsePromotionSettings({ priceCentsPerDay: 5, maxDays: 10 }),
    ).toMatchObject({ priceCentsPerDay: 1000, maxDays: 10 });
  });
});

describe('PromotionsService.quote', () => {
  it('reports available credit days', async () => {
    const { service } = setup({ credits: 2 });
    expect(await service.quote('owner', 5)).toMatchObject({
      days: 5,
      priceCentsPerDay: 1000,
      totalCents: 3000,
      creditDaysAvailable: 2,
      creditDaysUsed: 2,
    });
  });

  it('rejects more days than maxDays', async () => {
    const { service } = setup();
    await expect(service.quote('owner', 31)).rejects.toMatchObject({
      response: { code: 'VALIDATION_ERROR' },
    });
  });
});

describe('PromotionsService.create', () => {
  it('only the case owner (404 for anyone else)', async () => {
    const { service } = setup();
    await expect(
      service.create('stranger', 'c1', { days: 1 }),
    ).rejects.toMatchObject({ response: { code: 'CASE_NOT_FOUND' } });
  });

  it('only an open case', async () => {
    const s = setup();
    s.prisma.case.findUnique.mockResolvedValue({
      id: 'c1',
      client_id: 'owner',
      status: 'in_progress',
      deleted_at: null,
    });
    await expect(
      s.service.create('owner', 'c1', { days: 1 }),
    ).rejects.toMatchObject({ response: { code: 'CASE_INVALID_STATE' } });
  });

  it('one active promotion per case', async () => {
    const s = setup();
    s.prisma.casePromotion.findFirst.mockResolvedValue({ id: 'running' });
    await expect(
      s.service.create('owner', 'c1', { days: 1 }),
    ).rejects.toMatchObject({ response: { code: 'PROMOTION_ALREADY_ACTIVE' } });
  });

  it('off unless enabled', async () => {
    const s = setup({ enabled: false });
    await expect(
      s.service.create('owner', 'c1', { days: 1 }),
    ).rejects.toMatchObject({ response: { code: 'FEATURE_DISABLED' } });
  });

  it('fully covered by credits → active now, no checkout', async () => {
    const s = setup({ credits: 3 });
    const res = await s.service.create('owner', 'c1', { days: 2 });
    expect(res.status).toBe('active');
    expect(res.checkoutUrl).toBeNull();
    expect(res.creditDaysUsed).toBe(2);
    expect(s.provider.createOneTimeCheckout).not.toHaveBeenCalled();
    const data = s.prisma.casePromotion.create.mock.calls[0][0].data as {
      total_cents: number;
      starts_at: Date;
      ends_at: Date;
    };
    expect(data.total_cents).toBe(0);
    expect(data.ends_at.getTime() - data.starts_at.getTime()).toBe(2 * DAY);
    expect(s.referrals.consumePromotionCredits).toHaveBeenCalledWith(
      s.prisma,
      'owner',
      'p1',
      2,
    );
  });

  it('otherwise a pending promotion and a checkout URL', async () => {
    const s = setup({ credits: 1 });
    const res = await s.service.create('owner', 'c1', { days: 3 });
    expect(res).toMatchObject({
      promotionId: 'p1',
      status: 'pending_payment',
      checkoutUrl: 'https://pay/cs_1',
      totalCents: 2000,
      creditDaysUsed: 1,
    });
    expect(s.provider.createOneTimeCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 2000,
        metadata: {
          kind: 'case_promotion',
          promotionId: 'p1',
          caseId: 'c1',
          userId: 'owner',
        },
        idempotencyKey: 'case-promotion:p1',
      }),
    );
    expect(s.prisma.casePromotion.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { stripe_checkout_id: 'cs_1' },
    });
  });

  it('a failed checkout gives the credits back', async () => {
    const s = setup({ credits: 1 });
    s.provider.createOneTimeCheckout.mockRejectedValue(new Error('stripe'));
    await expect(s.service.create('owner', 'c1', { days: 3 })).rejects.toThrow(
      'stripe',
    );
    expect(s.referrals.restorePromotionCredits).toHaveBeenCalledWith(
      s.prisma,
      'owner',
      'p1',
    );
  });

  it('rejects a promo code not valid for promotions', async () => {
    const s = setup();
    s.prisma.promoCode.findUnique.mockResolvedValue({
      id: 'pc',
      active: true,
      applies_to: 'monthly',
      audience: 'all',
      starts_at: null,
      expires_at: null,
      max_redemptions: null,
      redeemed_count: 0,
      discount_type: 'percent',
    });
    await expect(
      s.service.create('owner', 'c1', { days: 1, promoCode: 'save10' }),
    ).rejects.toMatchObject({ response: { code: 'PROMO_CODE_INVALID' } });
  });

  it('a 100 % promo code activates for free and is redeemed', async () => {
    const s = setup();
    s.prisma.promoCode.findUnique.mockResolvedValue({
      id: 'pc',
      active: true,
      applies_to: 'promotion',
      audience: 'client',
      starts_at: null,
      expires_at: null,
      max_redemptions: 10,
      redeemed_count: 1,
      discount_type: 'percent',
      percent_off: 100,
      amount_off_cents: null,
      free_days: null,
    });
    const res = await s.service.create('owner', 'c1', {
      days: 2,
      promoCode: 'FREE',
    });
    expect(res.status).toBe('active');
    expect(s.prisma.promoRedemption.create).toHaveBeenCalled();
    expect(s.prisma.promoCode.update).toHaveBeenCalledWith({
      where: { id: 'pc' },
      data: { redeemed_count: { increment: 1 } },
    });
  });
});

describe('PromotionsService.applyCheckout', () => {
  const session: ProviderCheckoutSession = {
    id: 'cs_1',
    url: null,
    status: 'complete',
    customerId: null,
    subscriptionId: null,
    metadata: { kind: 'case_promotion', promotionId: 'p1' },
    paymentIntentId: 'pi_1',
    amountTotalCents: 3000,
    paymentStatus: 'paid',
  };
  const pending = {
    id: 'p1',
    case_id: 'c1',
    user_id: 'owner',
    days: 3,
    price_cents_per_day: 1000,
    total_cents: 3000,
    status: 'pending_payment',
    stripe_checkout_id: 'cs_1',
    promo_code_id: null,
    canceled_by: null,
    cancel_reason: null,
  };

  it('activates once with a Payment row', async () => {
    const s = setup();
    s.prisma.casePromotion.findUnique.mockResolvedValue(pending);
    expect(await s.service.applyCheckout(session)).toBe(true);
    expect(s.prisma.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: 'owner',
        stripe_payment_intent_id: 'pi_1',
        amount_cents: 3000,
        status: 'succeeded',
      }),
    });
    const data = s.prisma.casePromotion.update.mock.calls[0][0].data as {
      status: string;
      payment_id: string;
      starts_at: Date;
      ends_at: Date;
    };
    expect(data.status).toBe('active');
    expect(data.payment_id).toBe('pay1');
    expect(data.ends_at.getTime() - data.starts_at.getTime()).toBe(3 * DAY);

    // Replayed webhook: already active → nothing.
    s.prisma.casePromotion.findUnique.mockResolvedValue({
      ...pending,
      status: 'active',
    });
    s.prisma.payment.create.mockClear();
    expect(await s.service.applyCheckout(session)).toBe(false);
    expect(s.prisma.payment.create).not.toHaveBeenCalled();
  });

  it('ignores other sessions and unpaid ones', async () => {
    const s = setup();
    expect(
      await s.service.applyCheckout({ ...session, metadata: { userId: 'x' } }),
    ).toBe(false);
    expect(
      await s.service.applyCheckout({ ...session, paymentStatus: 'unpaid' }),
    ).toBe(false);
    s.prisma.casePromotion.findUnique.mockResolvedValue({
      ...pending,
      stripe_checkout_id: 'cs_other',
    });
    expect(await s.service.applyCheckout(session)).toBe(false);
  });

  it('starts after a promotion that is still running', async () => {
    const s = setup();
    const runningEnd = new Date(Date.now() + 2 * DAY);
    s.prisma.casePromotion.findUnique.mockResolvedValue(pending);
    s.prisma.casePromotion.findFirst.mockResolvedValue({ ends_at: runningEnd });
    await s.service.applyCheckout(session);
    const data = s.prisma.casePromotion.update.mock.calls[0][0].data;
    expect(data.starts_at).toEqual(runningEnd);
  });
});

describe('PromotionsService.expire', () => {
  it('finishes ended promotions and abandons stale checkouts', async () => {
    const s = setup();
    const now = new Date('2026-10-02T12:00:00Z');
    s.prisma.casePromotion.updateMany.mockResolvedValue({ count: 1 });
    s.prisma.casePromotion.findMany
      // time over
      .mockResolvedValueOnce([
        { id: 'e1', user_id: 'owner', case_id: 'c1', post_id: null },
      ])
      // still running: case c1 is open (setup) → kept
      .mockResolvedValueOnce([
        { id: 'r1', user_id: 'owner', case_id: 'c1', post_id: null },
      ])
      .mockResolvedValue([{ id: 'old', user_id: 'owner' }]);
    expect(await s.service.expire(now)).toEqual({ finished: 1, abandoned: 1 });
    expect(s.prisma.casePromotion.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'e1', status: 'active' },
      data: { status: 'finished', cancel_reason: 'time_over' },
    });
    expect(s.prisma.casePromotion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'pending_payment',
          created_at: { lt: new Date(now.getTime() - DAY) },
        },
      }),
    );
    expect(s.referrals.restorePromotionCredits).toHaveBeenCalledWith(
      s.prisma,
      'owner',
      'old',
    );
  });
});

describe('Instagram-style promotion (owner 2026-10-05)', () => {
  it('quote: daily budget × days, reach from the CPM', async () => {
    const s = setup();
    const q = await s.service.quote('owner', 7, 1_000, 'post');
    // $70 at $5 CPM = 14 000 impressions ÷ 1.6 per person ≈ 8 750 people.
    expect(q.grossCents).toBe(7_000);
    expect(q.estImpressions).toBe(14_000);
    expect(q.estReachMin).toBe(7_000);
    expect(q.estReachMax).toBe(10_500);
    expect(q.enabled).toBe(true);
    expect(q.dailyBudgetCents).toBe(1_000);
  });

  it('a quote clamps the budget, a purchase outside the limits is a 400', async () => {
    const s = setup();
    expect(
      (await s.service.quote('owner', 1, 1, 'case')).dailyBudgetCents,
    ).toBe(DEFAULT_PROMOTION_SETTINGS.minDailyBudgetCents);
    await expect(
      s.service.create('owner', 'c1', { days: 1, dailyBudgetCents: 10 }),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });

  it('no subscription needed unless the admin requires one', async () => {
    const s = setup();
    const entitlements = { has: jest.fn().mockResolvedValue(false) };
    const service = new PromotionsService(
      s.prisma as unknown as PrismaService,
      { get: jest.fn() } as unknown as ConfigService,
      s.referrals as unknown as ReferralsService,
      s.provider as unknown as PaymentProvider,
      undefined,
      entitlements as never,
    );
    await expect(service.quote('owner', 1)).resolves.toBeTruthy();
    expect(entitlements.has).not.toHaveBeenCalled();
  });

  it('promotes my own published post with an audience and a reach cap', async () => {
    const s = setup();
    s.prisma.post.findUnique.mockResolvedValue({
      author_id: 'owner',
      status: 'published',
      deleted_at: null,
    });
    const r = await s.service.createPost('owner', 'p9', {
      days: 3,
      dailyBudgetCents: 500,
      audience: { role: 'clients', states: ['CA'], countries: [], topics: [] },
    });
    expect(r.checkoutUrl).toBe('https://pay/cs_1');
    const data = s.prisma.casePromotion.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      target_type: 'post',
      post_id: 'p9',
      case_id: null,
      total_cents: 1_500,
      target_impressions: 3_000,
      audience: { role: 'clients', states: ['CA'] },
    });
  });

  it("someone else's post is not found", async () => {
    const s = setup();
    s.prisma.post.findUnique.mockResolvedValue({
      author_id: 'other',
      status: 'published',
      deleted_at: null,
    });
    await expect(
      s.service.createPost('owner', 'p9', { days: 1 }),
    ).rejects.toMatchObject({ response: { code: 'POST_NOT_FOUND' } });
  });

  it('reported content waits for a staff check after payment', async () => {
    const s = setup({ credits: 30 });
    s.prisma.report.count.mockResolvedValue(1);
    const r = await s.service.create('owner', 'c1', {
      days: 1,
      dailyBudgetCents: 1_000,
    });
    expect(r.status).toBe('pending_review');
    expect(r.checkoutUrl).toBeNull();
  });
});
