import { ConflictException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import type { ProviderSetupIntent } from './payment-provider';

/**
 * Owner 2026-10-11 (in-app payment sheet): `confirm` for an order that
 * `start` kept on the SetupIntent — the plan's prices, the coupon and the
 * trial days reach the provider; no trial without consent → 409.
 */
describe('SubscriptionsService.confirmOrder', () => {
  const user = { sub: 'user-1' } as never;

  function setup(opts: { attorneyEligible: boolean; cardEligible: boolean }) {
    const createSubscription = jest.fn().mockResolvedValue({ id: 'sub_1' });
    const svc = Object.create(SubscriptionsService.prototype) as Record<
      string,
      unknown
    >;
    svc.provider = { createSubscription };
    svc.attorneyTrialEligible = jest
      .fn()
      .mockResolvedValue(opts.attorneyEligible);
    svc.cardTrialEligible = jest.fn().mockResolvedValue(opts.cardEligible);
    const applyOrder = jest.fn().mockResolvedValue(undefined);
    svc.applyOrder = applyOrder;
    svc.me = jest.fn().mockResolvedValue({ isActive: true });
    return { svc, createSubscription, applyOrder };
  }

  const si = (extra: Record<string, string> = {}): ProviderSetupIntent => ({
    id: 'seti_1',
    customerId: 'cus_1',
    status: 'succeeded',
    paymentMethodId: 'pm_1',
    metadata: {
      planId: 'plan-1',
      items: 'price_plan:1,price_seat:2',
      planTrialDays: '7',
      priceCents: '59900',
      couponId: 'co_1',
      ...extra,
    },
  });

  const run = (
    svc: Record<string, unknown>,
    intent: ProviderSetupIntent,
    chargeNow: boolean,
  ) =>
    (
      svc as unknown as {
        confirmOrder: (...a: unknown[]) => Promise<unknown>;
      }
    ).confirmOrder(user, intent, 'fp', chargeNow, 'cus_1');

  it('creates the subscription with the plan prices, coupon and trial', async () => {
    const { svc, createSubscription, applyOrder } = setup({
      attorneyEligible: true,
      cardEligible: true,
    });
    await run(svc, si(), false);
    expect(createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cus_1',
        paymentMethodId: 'pm_1',
        couponId: 'co_1',
        trialDays: 7,
        lineItems: [
          { priceId: 'price_plan', quantity: 1 },
          { priceId: 'price_seat', quantity: 2 },
        ],
      }),
    );
    expect(applyOrder).toHaveBeenCalledTimes(1);
  });

  it('adds a promo free-days to the trial, and gives them even without a trial', async () => {
    const { svc, createSubscription } = setup({
      attorneyEligible: false,
      cardEligible: true,
    });
    await run(svc, si({ promoFreeDays: '14' }), false);
    expect(createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ trialDays: 14 }),
    );
  });

  it('no trial and no consent → 409 with the amount to charge', async () => {
    const { svc, createSubscription } = setup({
      attorneyEligible: true,
      cardEligible: false,
    });
    await expect(run(svc, si(), false)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(createSubscription).not.toHaveBeenCalled();
    await run(svc, si(), true);
    expect(createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ trialDays: null }),
    );
  });
});
