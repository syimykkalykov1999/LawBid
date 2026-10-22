import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import { FakePaymentProvider } from '../billing/fake-payment.provider';
import type { PayLinkService } from '../billing/pay-link.service';
import type { ReferralsService } from '../referrals/referrals.service';
import { PromotionsService } from './promotions.service';

/**
 * Owner 2026-10-22: Boost is paid on our own card page (a PaymentIntent),
 * not on Stripe's hosted page; an unpaid Boost can be cancelled (the
 * payment is voided first) and started again.
 */
function setup(row: Record<string, unknown>) {
  let current: Record<string, unknown> = { ...row };
  const prisma = {
    casePromotion: {
      findUnique: jest.fn(() => Promise.resolve({ ...current })),
      findUniqueOrThrow: jest.fn(() => Promise.resolve({ ...current })),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        current = { ...current, ...data };
        return Promise.resolve({ ...current });
      }),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { status?: string };
          data: Record<string, unknown>;
        }) => {
          if (where.status && where.status !== current.status) {
            return Promise.resolve({ count: 0 });
          }
          current = { ...current, ...data };
          return Promise.resolve({ count: 1 });
        },
      ),
    },
    appConfig: { findUnique: jest.fn().mockResolvedValue(null) },
    report: { count: jest.fn().mockResolvedValue(0) },
    case: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'c1',
        client_id: 'owner',
        status: 'open',
        deleted_at: null,
      }),
    },
    post: { findUnique: jest.fn().mockResolvedValue(null) },
    payment: { create: jest.fn().mockResolvedValue({ id: 'pay1' }) },
    user: { findUnique: jest.fn().mockResolvedValue({ email: 'o@x.io' }) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
  );
  const referrals = {
    restorePromotionCredits: jest.fn().mockResolvedValue(0),
  };
  const provider = new FakePaymentProvider();
  const payLink = {
    enabled: jest.fn().mockResolvedValue(true),
    link: jest.fn().mockResolvedValue({
      url: 'https://lawbid.dev/pay.html#t=x',
      id: 'x',
      token: 'x',
    }),
  };
  const service = new PromotionsService(
    prisma as unknown as PrismaService,
    { get: jest.fn() } as unknown as ConfigService,
    referrals as unknown as ReferralsService,
    provider,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    payLink as unknown as PayLinkService,
  );
  return { service, provider, prisma, row: () => current, referrals };
}

const pending = {
  id: 'p1',
  case_id: 'c1',
  post_id: null,
  user_id: 'owner',
  days: 3,
  price_cents_per_day: 1000,
  total_cents: 3000,
  status: 'pending_payment',
  stripe_checkout_id: null,
  promo_code_id: null,
  canceled_by: null,
  cancel_reason: null,
  impressions: 0,
  created_at: new Date(),
};

describe('Boost on our own card page (owner 2026-10-22)', () => {
  it('the page gets one PaymentIntent for the promotion, kept on the row', async () => {
    const s = setup(pending);
    const a = await s.service.payPageSession('owner', 'p1');
    expect(a).toMatchObject({ paid: false, amountCents: 3000, days: 3 });
    expect(a.paymentIntentId).toMatch(/^fake_pi_/);
    expect(s.row().stripe_checkout_id).toBe(a.paymentIntentId);
    const b = await s.service.payPageSession('owner', 'p1');
    expect(b.paymentIntentId).toBe(a.paymentIntentId);
    const pi = await s.provider.retrievePaymentIntent(a.paymentIntentId!);
    expect(pi?.metadata).toMatchObject({
      kind: 'case_promotion',
      promotionId: 'p1',
    });
  });

  it("someone else's promotion is not found", async () => {
    const s = setup(pending);
    await expect(s.service.payPageSession('stranger', 'p1')).rejects.toThrow(
      'Promotion not found.',
    );
  });

  it('paid on the page → active with a Payment row', async () => {
    const s = setup(pending);
    const a = await s.service.payPageSession('owner', 'p1');
    expect(await s.service.payPageConfirm('owner', 'p1')).toBe(false);
    s.provider.payPaymentIntent(a.paymentIntentId!);
    expect(await s.service.payPageConfirm('owner', 'p1')).toBe(true);
    expect(s.row().status).toBe('active');
    expect(s.prisma.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stripe_payment_intent_id: a.paymentIntentId,
        amount_cents: 3000,
      }),
    });
  });

  it('«Отменить»: the PaymentIntent is voided, the promotion cancelled, credits back', async () => {
    const s = setup(pending);
    const a = await s.service.payPageSession('owner', 'p1');
    const dto = await s.service.stop('owner', 'p1');
    expect(dto.status).toBe('canceled');
    expect(
      (await s.provider.retrievePaymentIntent(a.paymentIntentId!))?.status,
    ).toBe('canceled');
    expect(s.referrals.restorePromotionCredits).toHaveBeenCalled();
    // The page left open can no longer take the money.
    expect(() => s.provider.payPaymentIntent(a.paymentIntentId!)).toThrow();
    await expect(s.service.payPageSession('owner', 'p1')).rejects.toThrow(
      /cancelled/,
    );
  });

  it('cancel after it was paid meanwhile → applied, not cancelled', async () => {
    const s = setup(pending);
    const a = await s.service.payPageSession('owner', 'p1');
    s.provider.payPaymentIntent(a.paymentIntentId!);
    const dto = await s.service.stop('owner', 'p1');
    expect(dto.status).toBe('active');
  });

  it("an old Stripe hosted session is closed before the card page's intent", async () => {
    const s = setup(pending);
    const old = await s.provider.createOneTimeCheckout({
      amountCents: 3000,
      description: 'x',
      metadata: { kind: 'case_promotion', promotionId: 'p1' },
      successUrl: 'https://x/s',
      cancelUrl: 'https://x/c',
    });
    s.prisma.casePromotion.update({ data: { stripe_checkout_id: old.id } });
    const a = await s.service.payPageSession('owner', 'p1');
    expect(a.paid).toBe(false);
    expect((await s.provider.retrieveCheckoutSession(old.id))?.status).toBe(
      'expired',
    );
    expect(s.row().stripe_checkout_id).toBe(a.paymentIntentId);
  });
});
