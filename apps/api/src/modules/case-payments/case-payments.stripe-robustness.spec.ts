import type { ConfigService } from '@nestjs/config';
import type {
  ProviderConnectedCheckout,
  ProviderEvent,
} from '../billing/payment-provider';
import {
  CASE_PAYMENT_CHECKOUT_KIND,
  CasePaymentsService,
  EXPIRE_MAX_CHECKS,
  EXPIRE_PAGE,
} from './case-payments.service';

/**
 * Stripe robustness 2026-10-27 (Stripe fixtures): expire() asks Stripe
 * before it cancels and never cancels a paid checkout; the new webhook
 * types change state, queue a review item and book (or reverse) the ledger.
 */
type Row = Record<string, unknown>;

function make(payment: Row, over: { appConfig?: Row } = {}) {
  const rows = new Map<string, Row>([[payment.id as string, payment]]);
  const refunds = new Map<string, Row>();
  const accounts = new Map<string, Row>([
    [
      'att_1',
      {
        user_id: 'att_1',
        stripe_account_id: 'acct_1',
        charges_enabled: true,
        payouts_enabled: true,
      },
    ],
  ]);
  const matches = (r: Row, where: Row) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && 'in' in (v as Row)) {
        return ((v as Row).in as unknown[]).includes(r[k]);
      }
      if (v && typeof v === 'object' && 'lt' in (v as Row)) {
        return (r[k] as Date) < ((v as Row).lt as Date);
      }
      if (v && typeof v === 'object' && 'not' in (v as Row)) {
        return r[k] !== (v as Row).not;
      }
      return r[k] === v;
    });
  const db = {
    casePayment: {
      findUnique: jest.fn(({ where }: { where: Row }) =>
        Promise.resolve(
          [...rows.values()].find((r) => matches(r, where)) ?? null,
        ),
      ),
      findFirst: jest.fn(({ where }: { where: Row }) =>
        Promise.resolve(
          [...rows.values()].find((r) => matches(r, where)) ?? null,
        ),
      ),
      findMany: jest.fn(({ where }: { where: Row }) =>
        Promise.resolve([...rows.values()].filter((r) => matches(r, where))),
      ),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: Row }) => {
          const next = { ...rows.get(where.id), ...data };
          rows.set(where.id, next);
          return Promise.resolve(next);
        },
      ),
      updateMany: jest.fn(({ where, data }: { where: Row; data: Row }) => {
        let count = 0;
        for (const [id, r] of rows) {
          if (matches(r, where)) {
            rows.set(id, { ...r, ...data });
            count += 1;
          }
        }
        return Promise.resolve({ count });
      }),
    },
    casePaymentRefund: {
      create: jest.fn(({ data }: { data: Row }) => {
        const row = { id: `rf_${refunds.size + 1}`, ...data };
        refunds.set(row.id, row);
        return Promise.resolve(row);
      }),
      findUnique: jest.fn(({ where }: { where: Row }) =>
        Promise.resolve(
          [...refunds.values()].find((r) => matches(r, where)) ?? null,
        ),
      ),
      findFirst: jest.fn(({ where }: { where: Row }) =>
        Promise.resolve(
          [...refunds.values()].find((r) => matches(r, where)) ?? null,
        ),
      ),
      findMany: jest.fn(() => Promise.resolve([])),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: Row }) => {
          const next = { ...refunds.get(where.id), ...data };
          refunds.set(where.id, next);
          return Promise.resolve(next);
        },
      ),
      updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
    payoutAccount: {
      findUnique: jest.fn(({ where }: { where: Row }) =>
        Promise.resolve(
          [...accounts.values()].find((r) => matches(r, where)) ?? null,
        ),
      ),
      update: jest.fn(
        ({ where, data }: { where: { user_id: string }; data: Row }) => {
          const next = { ...accounts.get(where.user_id), ...data };
          accounts.set(where.user_id, next);
          return Promise.resolve(next);
        },
      ),
    },
    appConfig: {
      findUnique: jest.fn(() => Promise.resolve(over.appConfig ?? null)),
    },
  };
  const prisma = {
    ...db,
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  };
  const notifications = { emit: jest.fn(() => Promise.resolve()) };
  const provider = {
    retrieveConnectedCheckout: jest.fn(),
    expireConnectedCheckout: jest.fn(),
    retrieveConnectedCharge: jest.fn(),
  };
  const ledger = {
    casePaymentSucceeded: jest.fn(() => Promise.resolve({ created: true })),
    casePaymentRefunded: jest.fn(() => Promise.resolve({ created: true })),
    reverseCaseEntry: jest.fn(() => Promise.resolve({ created: true })),
  };
  const review = {
    open: jest.fn(() => Promise.resolve({})),
    closeByRef: jest.fn(() => Promise.resolve()),
  };
  const disputes = {
    onCaseDispute: jest.fn(() => Promise.resolve()),
    onPlatformDispute: jest.fn(() => Promise.resolve()),
  };
  const svc = new CasePaymentsService(
    prisma as never,
    { get: () => undefined } as unknown as ConfigService,
    { isEnabled: jest.fn(() => Promise.resolve(true)) } as never,
    {} as never,
    provider as never,
    notifications as never,
    undefined,
    undefined,
    undefined,
    ledger as never,
    review as never,
    disputes as never,
  );
  return {
    svc,
    db,
    rows,
    refunds,
    accounts,
    notifications,
    provider,
    ledger,
    review,
    disputes,
  };
}

const old = new Date(Date.now() - 3 * 86_400_000);
const base = (over: Row = {}): Row => ({
  id: 'cp_1',
  case_id: 'case_1',
  attorney_id: 'att_1',
  client_id: 'cli_1',
  stripe_account_id: 'acct_1',
  stripe_checkout_id: 'cs_1',
  status: 'pending_payment',
  canceled_reason: null,
  amount_cents: 50_000,
  client_total_cents: 51_500,
  platform_fee_cents: 1_500,
  attorney_net_cents: 50_000,
  currency: 'usd',
  refunded_cents: 0,
  request_id: null,
  stripe_charge_id: null,
  disputed_at: null,
  receipt_url: null,
  created_at: old,
  ...over,
});

const session = (
  over: Partial<ProviderConnectedCheckout> = {},
): ProviderConnectedCheckout => ({
  id: 'cs_1',
  accountId: 'acct_1',
  url: null,
  status: 'open',
  paymentStatus: 'unpaid',
  paymentIntentId: null,
  chargeId: null,
  receiptUrl: null,
  amountTotalCents: 51_500,
  metadata: { kind: CASE_PAYMENT_CHECKOUT_KIND, paymentId: 'cp_1' },
  ...over,
});
const paidSession = () =>
  session({
    status: 'complete',
    paymentStatus: 'paid',
    paymentIntentId: 'pi_1',
    chargeId: 'ch_1',
  });

const event = (type: string, object: Row): ProviderEvent => ({
  id: `evt_${type}`,
  type,
  created: 0,
  object: { object: 'x', id: 'obj_1', _account: 'acct_1', ...object },
});

describe('CasePaymentsService.expire (asks Stripe first)', () => {
  it('records a checkout that was paid instead of cancelling it', async () => {
    const h = make(base());
    h.provider.retrieveConnectedCheckout.mockResolvedValue(session());
    h.provider.expireConnectedCheckout.mockResolvedValue(paidSession());
    const out = await h.svc.expire();
    expect(out).toEqual({ abandoned: 0, recovered: 1, deferred: 0 });
    expect(h.rows.get('cp_1')?.status).toBe('succeeded');
    expect(h.ledger.casePaymentSucceeded).toHaveBeenCalledTimes(1);
  });

  it('a paid session seen on the first read is never touched on Stripe', async () => {
    const h = make(base());
    h.provider.retrieveConnectedCheckout.mockResolvedValue(paidSession());
    const out = await h.svc.expire();
    expect(out.recovered).toBe(1);
    expect(h.provider.expireConnectedCheckout).not.toHaveBeenCalled();
    expect(h.rows.get('cp_1')?.status).toBe('succeeded');
  });

  it('closes an open session on Stripe, then cancels', async () => {
    const h = make(base());
    h.provider.retrieveConnectedCheckout.mockResolvedValue(session());
    h.provider.expireConnectedCheckout.mockResolvedValue(
      session({ status: 'expired' }),
    );
    const out = await h.svc.expire();
    expect(out).toEqual({ abandoned: 1, recovered: 0, deferred: 0 });
    expect(h.provider.expireConnectedCheckout).toHaveBeenCalledWith(
      'acct_1',
      'cs_1',
    );
    expect(h.rows.get('cp_1')).toMatchObject({
      status: 'canceled',
      canceled_reason: 'checkout_expired',
    });
  });

  it('leaves the row alone when Stripe cannot be asked or says unpaid-but-complete', async () => {
    const down = make(base());
    down.provider.retrieveConnectedCheckout.mockRejectedValue(
      new Error('stripe 503'),
    );
    expect(await down.svc.expire()).toEqual({
      abandoned: 0,
      recovered: 0,
      deferred: 1,
    });
    expect(down.rows.get('cp_1')?.status).toBe('pending_payment');

    const delayed = make(base());
    delayed.provider.retrieveConnectedCheckout.mockResolvedValue(
      session({ status: 'complete', paymentStatus: 'unpaid' }),
    );
    expect((await delayed.svc.expire()).deferred).toBe(1);
    expect(delayed.rows.get('cp_1')?.status).toBe('pending_payment');
  });

  it('a payment that never got a checkout is cancelled; a young one is skipped', async () => {
    const none = make(base({ stripe_checkout_id: null }));
    expect((await none.svc.expire()).abandoned).toBe(1);
    const young = make(base({ created_at: new Date() }));
    expect(await young.svc.expire()).toEqual({
      abandoned: 0,
      recovered: 0,
      deferred: 0,
    });
    expect(young.provider.retrieveConnectedCheckout).not.toHaveBeenCalled();
  });
});

describe('CasePaymentsService.expire: no head-of-line (R-36)', () => {
  it('expires checkout-less rows in their own query, keyset-pages the rest from a cursor', async () => {
    const h = make(base({ stripe_checkout_id: null }));
    const findMany = h.db.casePayment.findMany as unknown as jest.Mock;
    const updateMany = h.db.casePayment.updateMany as unknown as jest.Mock;
    await h.svc.expire();
    // first statement: one UPDATE for rows without a checkout
    expect(updateMany.mock.calls[0][0].where).toMatchObject({
      status: 'pending_payment',
      stripe_checkout_id: null,
    });
    const q = findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      orderBy: unknown;
      take: number;
    };
    expect(q.where.stripe_checkout_id).toEqual({ not: null });
    expect(q.orderBy).toEqual([{ created_at: 'asc' }, { id: 'asc' }]);
    expect(q.take).toBe(EXPIRE_PAGE);
  });

  it('a full page of unresolved rows moves the cursor past them for the next run', async () => {
    const h = make(base());
    h.provider.retrieveConnectedCheckout.mockRejectedValue(new Error('503'));
    const findMany = h.db.casePayment.findMany as unknown as jest.Mock;
    const stuck = Array.from({ length: EXPIRE_PAGE }, (_, i) =>
      base({
        id: `cp_s${String(i).padStart(3, '0')}`,
        created_at: new Date('2026-01-01T00:00:00Z'),
      }),
    );
    findMany.mockResolvedValueOnce(stuck).mockResolvedValueOnce([]);
    const first = await h.svc.expire();
    expect(first.deferred).toBe(EXPIRE_PAGE);
    // the second page asked for rows AFTER the last stuck one
    expect(findMany.mock.calls[1][0].where.OR).toEqual([
      { created_at: { gt: stuck[EXPIRE_PAGE - 1].created_at } },
      {
        created_at: stuck[EXPIRE_PAGE - 1].created_at,
        id: { gt: stuck[EXPIRE_PAGE - 1].id },
      },
    ]);
    // the end was reached: the next run starts at the oldest again
    findMany.mockResolvedValueOnce([]);
    await h.svc.expire();
    expect(findMany.mock.calls[2][0].where.OR).toBeUndefined();
  });

  it('never makes more than EXPIRE_MAX_CHECKS Stripe reads in one run', async () => {
    const h = make(base());
    h.provider.retrieveConnectedCheckout.mockRejectedValue(new Error('503'));
    const findMany = h.db.casePayment.findMany as unknown as jest.Mock;
    const page = Array.from({ length: EXPIRE_PAGE }, (_, i) =>
      base({ id: `cp_${i}`, created_at: new Date('2026-01-01T00:00:00Z') }),
    );
    findMany.mockResolvedValue(page);
    expect((await h.svc.expire()).deferred).toBe(EXPIRE_MAX_CHECKS);
  });
});

describe('CasePaymentsService: new Stripe events', () => {
  const paid = (over: Row = {}) =>
    base({
      status: 'succeeded',
      stripe_charge_id: 'ch_1',
      stripe_payment_intent_id: 'pi_1',
      ...over,
    });

  it('payment_intent.payment_failed keeps the payment pending and stores the decline code', async () => {
    const h = make(base());
    await h.svc.handleProviderEvent(
      event('payment_intent.payment_failed', {
        metadata: { paymentId: 'cp_1' },
        last_payment_error: {
          code: 'card_declined',
          decline_code: 'insufficient_funds',
        },
      }),
    );
    expect(h.rows.get('cp_1')).toMatchObject({
      status: 'pending_payment',
      failure_code: 'insufficient_funds',
    });
  });

  it('checkout.session.expired cancels only after Stripe confirms; a paid one is recorded', async () => {
    const expired = make(base());
    expired.provider.retrieveConnectedCheckout.mockResolvedValue(
      session({ status: 'expired' }),
    );
    const ev = event('checkout.session.expired', {});
    ev.object.id = 'cs_1';
    await expired.svc.handleProviderEvent(ev);
    expect(expired.rows.get('cp_1')?.status).toBe('canceled');

    const racing = make(base());
    racing.provider.retrieveConnectedCheckout.mockResolvedValue(paidSession());
    await racing.svc.handleProviderEvent(ev);
    expect(racing.rows.get('cp_1')?.status).toBe('succeeded');
  });

  it('a failed refund is undone: totals, ledger reversal, review item', async () => {
    const h = make(
      paid({ status: 'partially_refunded', refunded_cents: 10_000 }),
    );
    h.refunds.set('rf_1', {
      id: 'rf_1',
      payment_id: 'cp_1',
      amount_cents: 10_000,
      status: 'pending',
      stripe_refund_id: 're_1',
    });
    const ev = event('charge.refund.updated', {
      status: 'failed',
      failure_reason: 'expired_or_canceled_card',
    });
    ev.object.id = 're_1';
    await h.svc.handleProviderEvent(ev);
    expect(h.refunds.get('rf_1')).toMatchObject({ status: 'failed' });
    expect(h.rows.get('cp_1')).toMatchObject({
      refunded_cents: 0,
      status: 'succeeded',
    });
    expect(h.ledger.reverseCaseEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        originalSourceId: 'rf_1',
        reason: 'refund_failed',
      }),
    );
    expect(h.review.open).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'refund_failed', stripeRef: 're_1' }),
    );
    // Redelivery: nothing happens twice.
    await h.svc.handleProviderEvent(ev);
    expect(h.ledger.reverseCaseEntry).toHaveBeenCalledTimes(1);
  });

  it('payout.failed marks the account and queues a review item', async () => {
    const h = make(paid());
    const ev = event('payout.failed', {
      failure_code: 'account_closed',
      amount: 40_000,
      currency: 'usd',
    });
    ev.object.id = 'po_1';
    await h.svc.handleProviderEvent(ev);
    expect(h.accounts.get('att_1')).toMatchObject({
      last_payout_failure_code: 'account_closed',
    });
    expect(h.review.open).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'payout_failed', stripeRef: 'po_1' }),
    );
    expect(h.notifications.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'payout_account_status',
        recipientId: 'att_1',
      }),
    );
  });

  it('account.application.deauthorized disables the payout account', async () => {
    const h = make(paid());
    await h.svc.handleProviderEvent(
      event('account.application.deauthorized', {}),
    );
    expect(h.accounts.get('att_1')).toMatchObject({
      status: 'disabled',
      charges_enabled: false,
      payouts_enabled: false,
    });
    expect(h.review.open).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'account_deauthorized' }),
    );
  });

  it('radar.early_fraud_warning.created queues the payment; refunds by itself only when the setting allows', async () => {
    const off = make(paid());
    const ev = event('radar.early_fraud_warning.created', {
      charge: 'ch_1',
      fraud_type: 'card_never_received',
      actionable: true,
    });
    ev.object.id = 'issfr_1';
    await off.svc.handleProviderEvent(ev);
    expect(off.review.open).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'early_fraud_warning',
        stripeRef: 'issfr_1',
        casePaymentId: 'cp_1',
      }),
    );
    expect(off.rows.get('cp_1')?.status).toBe('succeeded');
  });

  it('a dispute stores its id, reason and deadline in one transaction, then hands over to the dispute service', async () => {
    const h = make(paid());
    const ev = event('charge.dispute.created', {
      charge: 'ch_1',
      status: 'needs_response',
      reason: 'fraudulent',
      amount: 51_500,
      evidence_details: { due_by: 1_900_000_000 },
    });
    ev.object.id = 'dp_1';
    await h.svc.handleProviderEvent(ev);
    expect(h.rows.get('cp_1')).toMatchObject({
      status: 'disputed',
      dispute_id: 'dp_1',
      dispute_reason: 'fraudulent',
      dispute_amount_cents: 51_500,
    });
    expect((h.rows.get('cp_1')?.dispute_due_by as Date).getTime()).toBe(
      1_900_000_000_000,
    );
    expect(h.disputes.onCaseDispute).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cp_1' }),
      expect.objectContaining({ id: 'dp_1' }),
      true,
    );
  });

  it('funds_withdrawn only records the moment; funds_reinstated after a booked loss reverses it', async () => {
    const h = make(
      paid({
        status: 'refunded',
        refunded_cents: 51_500,
        dispute_status: 'lost',
      }),
    );
    h.refunds.set('rf_cb', {
      id: 'rf_cb',
      payment_id: 'cp_1',
      amount_cents: 51_500,
      reason: 'Dispute lost (chargeback)',
      initiated_by_type: 'stripe',
      status: 'succeeded',
    });
    await h.svc.handleProviderEvent(
      event('charge.dispute.funds_withdrawn', { charge: 'ch_1' }),
    );
    expect(h.rows.get('cp_1')?.dispute_funds_withdrawn_at).toBeInstanceOf(Date);
    expect(h.ledger.reverseCaseEntry).not.toHaveBeenCalled();

    await h.svc.handleProviderEvent(
      event('charge.dispute.funds_reinstated', { charge: 'ch_1' }),
    );
    expect(h.ledger.reverseCaseEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        originalSourceId: 'rf_cb',
        reason: 'dispute_reinstated',
      }),
    );
    expect(h.rows.get('cp_1')).toMatchObject({
      status: 'succeeded',
      refunded_cents: 0,
      dispute_status: 'won',
    });
  });

  it('a dispute on a charge that is not a case payment goes to the platform path', async () => {
    const h = make(paid());
    const ev = event('charge.dispute.created', {
      charge: 'ch_unknown',
      status: 'needs_response',
      payment_intent: 'pi_platform',
    });
    delete (ev.object as Row)._account;
    await h.svc.handleProviderEvent(ev);
    expect(h.disputes.onPlatformDispute).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'obj_1' }),
      'pi_platform',
    );
  });
});
