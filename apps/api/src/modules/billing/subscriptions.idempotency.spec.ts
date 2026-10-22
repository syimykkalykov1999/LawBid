import {
  SubscriptionsService,
  subscriptionAttemptKey,
} from './subscriptions.service';
import { StripePaymentProvider } from './stripe-payment.provider';
import type { ProviderSetupIntent } from './payment-provider';

/**
 * Audit #15 (2026-10-22): the Stripe subscription idempotency key is one
 * per client checkout attempt — never time-based (a retry that crossed the
 * hour used to create a second subscription).
 */
describe('subscription idempotency key (audit #15)', () => {
  const si = (meta: Record<string, string> = {}): ProviderSetupIntent => ({
    id: 'seti_1',
    customerId: 'cus_1',
    status: 'succeeded',
    paymentMethodId: 'pm_1',
    metadata: meta,
  });

  it('prefers the client Idempotency-Key, then the attempt id, then the intent', () => {
    expect(subscriptionAttemptKey(si({ attemptId: 'a1' }), 'k-123456')).toBe(
      'client:k-123456',
    );
    expect(subscriptionAttemptKey(si({ attemptId: 'a1' }))).toBe('attempt:a1');
    expect(subscriptionAttemptKey(si())).toBe('setup:seti_1');
  });

  it('the same attempt gives the same key at any time', () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-10-22T10:59:59Z'));
      const a = subscriptionAttemptKey(si({ attemptId: 'a1' }));
      jest.setSystemTime(new Date('2026-10-22T11:00:01Z'));
      expect(subscriptionAttemptKey(si({ attemptId: 'a1' }))).toBe(a);
    } finally {
      jest.useRealTimers();
    }
  });

  it('confirmOrder passes the attempt key to the provider', async () => {
    const createSubscription = jest.fn().mockResolvedValue({ id: 'sub_1' });
    const svc = Object.create(SubscriptionsService.prototype) as Record<
      string,
      unknown
    >;
    svc.provider = { createSubscription };
    svc.attorneyTrialEligible = jest.fn().mockResolvedValue(true);
    svc.cardTrialEligible = jest.fn().mockResolvedValue(true);
    svc.applyOrder = jest.fn().mockResolvedValue(undefined);
    svc.me = jest.fn().mockResolvedValue({});
    const confirmOrder = (
      svc as unknown as { confirmOrder: (...a: unknown[]) => Promise<unknown> }
    ).confirmOrder.bind(svc);
    const intent = si({
      planId: 'p',
      items: 'price_plan:1',
      attemptId: 'att-1',
    });
    await confirmOrder({ sub: 'u1' }, intent, 'fp', false, 'cus_1');
    await confirmOrder(
      { sub: 'u1' },
      intent,
      'fp',
      false,
      'cus_1',
      'cli-key-1',
    );
    expect(createSubscription.mock.calls[0][0]).toMatchObject({
      idempotencyKey: 'attempt:att-1',
    });
    expect(createSubscription.mock.calls[1][0]).toMatchObject({
      idempotencyKey: 'client:cli-key-1',
    });
  });

  it('Stripe receives the per-attempt key, scoped to the user', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'sub_1',
      customer: 'cus_1',
      status: 'trialing',
      items: { data: [] },
      metadata: {},
    });
    const provider = Object.create(StripePaymentProvider.prototype) as {
      stripe: unknown;
      createSubscription: StripePaymentProvider['createSubscription'];
    };
    Object.defineProperty(provider, 'stripe', {
      value: { subscriptions: { create } },
    });
    await provider
      .createSubscription({
        customerId: 'cus_1',
        priceId: 'price_1',
        paymentMethodId: 'pm_1',
        trialDays: 7,
        metadata: { userId: 'u1' },
        idempotencyKey: 'attempt:att-1',
      })
      .catch(() => undefined); // mapping of the fake object is not tested here
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][1]).toEqual({
      idempotencyKey: 'subscription:u1:attempt:att-1',
    });
  });
});
