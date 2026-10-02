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
    s.prisma.casePromotion.updateMany
      .mockResolvedValueOnce({ count: 4 })
      .mockResolvedValue({ count: 1 });
    s.prisma.casePromotion.findMany.mockResolvedValue([
      { id: 'old', user_id: 'owner' },
    ]);
    expect(await s.service.expire(now)).toEqual({ finished: 4, abandoned: 1 });
    expect(s.prisma.casePromotion.updateMany).toHaveBeenNthCalledWith(1, {
      where: { status: 'active', ends_at: { lt: now } },
      data: { status: 'finished' },
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
