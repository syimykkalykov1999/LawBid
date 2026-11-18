import { AdminPromotionsService } from './admin-promotions.service';

/**
 * Batch 8 PM1 (audit 2026-11-17): an admin cancel of an unpaid promotion
 * closes its open payment at Stripe first, exactly like the owner's
 * «Отменить» (PromotionsService.stop). A page left open can then never take
 * the money for a promotion that no longer exists.
 */
describe('AdminPromotionsService.cancel of an unpaid promotion (PM1)', () => {
  const pending = {
    id: 'p1',
    target_type: 'case',
    case_id: 'c1',
    post_id: null,
    user_id: 'owner',
    days: 3,
    price_cents_per_day: 1000,
    total_cents: 3000,
    status: 'pending_payment',
    stripe_checkout_id: 'pi_1',
    payment_id: null,
    paid_stars: 0,
    refunded_stars: 0,
    refunded_cents: 0,
    starts_at: null,
    ends_at: null,
    billing: 'impressions',
    impressions: 0,
    created_at: new Date(),
  };

  function setup(paidMeanwhile: boolean) {
    const order: string[] = [];
    let row: Record<string, unknown> = { ...pending };
    const promotions = {
      voidPayment: jest.fn(() => {
        order.push('void');
        if (paidMeanwhile) {
          // applyCheckout ran: the promotion is live with its Payment row.
          row = {
            ...row,
            status: 'active',
            payment_id: 'pay1',
            starts_at: new Date(),
            ends_at: new Date(Date.now() + 3 * 86_400_000),
          };
        }
        return Promise.resolve(paidMeanwhile);
      }),
      titles: jest.fn(() => Promise.resolve(new Map())),
    };
    const tx = {
      casePromotion: {
        findUnique: jest.fn(() => Promise.resolve({ ...row })),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          order.push('update');
          row = { ...row, ...data };
          return Promise.resolve({ ...row });
        }),
        findUniqueOrThrow: jest.fn(() => Promise.resolve({ ...row })),
      },
      case: { findMany: jest.fn(() => Promise.resolve([])) },
      user: { findMany: jest.fn(() => Promise.resolve([])) },
    };
    const prisma = {
      ...tx,
      $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    };
    const referrals = { restorePromotionCredits: jest.fn() };
    const audit = { record: jest.fn() };
    const refunds = { refund: jest.fn(() => Promise.resolve({})) };
    const service = new AdminPromotionsService(
      prisma as never,
      promotions as never,
      referrals as never,
      audit as never,
      refunds as never,
    );
    return { service, promotions, refunds, order, referrals };
  }
  const admin = { id: 'a1', ip: '127.0.0.1' } as never;

  it('voids the open payment before the row is canceled', async () => {
    const s = setup(false);
    await s.service.cancel(admin, 'p1', 'spam', 'none');
    expect(s.promotions.voidPayment).toHaveBeenCalledWith('pi_1');
    expect(s.order).toEqual(['void', 'update']);
    expect(s.referrals.restorePromotionCredits).toHaveBeenCalled();
    expect(s.refunds.refund).not.toHaveBeenCalled();
  });

  it('paid meanwhile: the promotion is canceled and the payment refunded in full', async () => {
    // Like Airbnb / Uber: a cancel by the platform returns everything paid.
    const s = setup(true);
    const res = await s.service.cancel(admin, 'p1', 'spam', 'none');
    expect(s.refunds.refund).toHaveBeenCalledWith(admin, {
      paymentId: 'pay1',
      amountCents: 3000,
      reason: 'spam',
    });
    expect(res.promotion.status).toBe('refunded');
    // Credits of a promotion that was paid stay spent (it ran its checkout).
    expect(s.referrals.restorePromotionCredits).not.toHaveBeenCalled();
  });
});
