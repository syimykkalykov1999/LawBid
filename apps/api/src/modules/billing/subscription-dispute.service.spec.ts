import { FakePaymentProvider } from './fake-payment.provider';
import type { ProviderEvent } from './payment-provider';
import { SubscriptionDisputeService } from './subscription-dispute.service';

/**
 * R-237: a bank dispute on a subscription charge — every branch of the
 * handler against the fake Stripe and stubbed collaborators.
 */

const DAY = 86_400;
const nowSec = () => Math.floor(Date.now() / 1000);

function setup(
  opts: {
    payment?: { id: string; user_id: string; stripe_invoice_id: string | null };
    flag?: boolean;
    row?: { id: string; stripe_subscription_id: string | null } | null;
    subStatus?: 'active' | 'canceled';
  } = {},
) {
  const fake = new FakePaymentProvider();
  fake.subscriptions.set('sub_1', {
    id: 'sub_1',
    customerId: 'cus_1',
    status: opts.subStatus ?? 'active',
    trialStart: null,
    trialEnd: null,
    currentPeriodStart: nowSec() - 10 * DAY,
    currentPeriodEnd: nowSec() + 20 * DAY,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    defaultPaymentMethodId: 'pm_fake',
    metadata: {},
    latestInvoiceId: null,
    created: nowSec() - 10 * DAY,
    _version: 1,
  });
  const cancelSpy = jest.spyOn(fake, 'cancelNow');
  const refundSpy = jest.fn();
  Object.assign(fake, { refund: refundSpy });
  const payment =
    opts.payment === undefined
      ? { id: 'pay_1', user_id: 'u1', stripe_invoice_id: 'in_1' }
      : opts.payment;
  const row =
    opts.row === undefined
      ? { id: 'row_1', stripe_subscription_id: 'sub_1' }
      : opts.row;
  const prisma = {
    payment: { findFirst: jest.fn(() => Promise.resolve(payment)) },
    subscription: { findUnique: jest.fn(() => Promise.resolve(row)) },
  };
  const settings = {
    boolean: jest.fn(() => Promise.resolve(opts.flag ?? true)),
  };
  const sync = { setDisputeHook: jest.fn(), apply: jest.fn() };
  const access = { invalidate: jest.fn(() => Promise.resolve()) };
  const review = { notifyStaff: jest.fn(() => Promise.resolve()) };
  const audit = { record: jest.fn(() => Promise.resolve()) };
  const svc = new SubscriptionDisputeService(
    prisma as never,
    fake,
    settings as never,
    sync as never,
    access as never,
    review as never,
    audit as never,
  );
  return {
    svc,
    fake,
    cancelSpy,
    refundSpy,
    prisma,
    sync,
    access,
    review,
    audit,
  };
}

const ev = (
  type: string,
  extra: Record<string, unknown> = {},
): ProviderEvent => ({
  id: 'evt_1',
  type,
  created: nowSec(),
  object: {
    object: 'dispute',
    id: 'dp_1',
    status: 'needs_response',
    reason: 'fraudulent',
    amount: 39_900,
    payment_intent: 'pi_1',
    ...extra,
  },
});

describe('SubscriptionDisputeService (R-237)', () => {
  it('registers itself as the sync dispute hook', () => {
    const t = setup();
    t.svc.onModuleInit();
    expect(t.sync.setDisputeHook).toHaveBeenCalledTimes(1);
  });

  it('created on a subscription charge: cancels now, syncs, audits, alerts, never refunds', async () => {
    const t = setup();
    await t.svc.onEvent(ev('charge.dispute.created'));
    expect(t.cancelSpy).toHaveBeenCalledWith('sub_1', {
      idempotencyKey: 'dispute:dp_1:cancel',
    });
    expect(t.fake.subscriptions.get('sub_1')!.status).toBe('canceled');
    expect(t.sync.apply).toHaveBeenCalledTimes(1);
    expect(t.access.invalidate).toHaveBeenCalledWith('u1');
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'system.billing.dispute.subscription_canceled',
        targetId: 'row_1',
        after: expect.objectContaining({
          disputeId: 'dp_1',
          refunded: false,
          actor: 'system',
        }),
      }),
    );
    expect(t.review.notifyStaff).toHaveBeenCalledTimes(1);
    expect(t.refundSpy).not.toHaveBeenCalled();
  });

  it('a repeated created event does not cancel or alert twice', async () => {
    const t = setup({ subStatus: 'canceled' });
    await t.svc.onEvent(ev('charge.dispute.created'));
    expect(t.cancelSpy).not.toHaveBeenCalled();
    expect(t.review.notifyStaff).not.toHaveBeenCalled();
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'system.billing.dispute.already_canceled',
      }),
    );
  });

  it('created, no subscription row: only an audit row', async () => {
    const t = setup({ row: null });
    await t.svc.onEvent(ev('charge.dispute.created'));
    expect(t.cancelSpy).not.toHaveBeenCalled();
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'system.billing.dispute.no_subscription',
        targetId: null,
      }),
    );
  });

  it('closed lost: recorded, nothing cancelled or refunded', async () => {
    const t = setup();
    await t.svc.onEvent(ev('charge.dispute.closed', { status: 'lost' }));
    expect(t.cancelSpy).not.toHaveBeenCalled();
    expect(t.refundSpy).not.toHaveBeenCalled();
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'system.billing.dispute.closed_lost',
        after: expect.objectContaining({ refunded: false }),
      }),
    );
  });

  it('closed won: recorded, the subscription is NOT reinstated', async () => {
    const t = setup({ subStatus: 'canceled' });
    await t.svc.onEvent(ev('charge.dispute.closed', { status: 'won' }));
    expect(t.sync.apply).not.toHaveBeenCalled();
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'system.billing.dispute.closed_won',
      }),
    );
  });

  it('not a subscription charge (no invoice payment): ignored', async () => {
    const t = setup({ payment: null as never });
    await t.svc.onEvent(ev('charge.dispute.created'));
    expect(t.cancelSpy).not.toHaveBeenCalled();
    expect(t.audit.record).not.toHaveBeenCalled();
    expect(t.prisma.payment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          stripe_payment_intent_id: 'pi_1',
          stripe_invoice_id: { not: null },
        },
      }),
    );
  });

  it('switch off: nothing happens', async () => {
    const t = setup({ flag: false });
    await t.svc.onEvent(ev('charge.dispute.created'));
    expect(t.prisma.payment.findFirst).not.toHaveBeenCalled();
    expect(t.cancelSpy).not.toHaveBeenCalled();
  });

  it('other dispute events and a missing payment intent are ignored', async () => {
    const t = setup();
    await t.svc.onEvent(ev('charge.dispute.updated'));
    await t.svc.onEvent(ev('charge.dispute.funds_withdrawn'));
    await t.svc.onEvent(ev('charge.dispute.created', { payment_intent: null }));
    expect(t.cancelSpy).not.toHaveBeenCalled();
    expect(t.audit.record).not.toHaveBeenCalled();
  });

  it('a failing Stripe cancel is not swallowed (the webhook retries)', async () => {
    const t = setup();
    t.cancelSpy.mockRejectedValueOnce(new Error('stripe down'));
    await expect(t.svc.onEvent(ev('charge.dispute.created'))).rejects.toThrow(
      'stripe down',
    );
    expect(t.audit.record).not.toHaveBeenCalled();
  });
});
