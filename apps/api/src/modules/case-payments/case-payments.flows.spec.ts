import type { ConfigService } from '@nestjs/config';
import type {
  ProviderConnectedCheckout,
  ProviderEvent,
} from '../billing/payment-provider';
import {
  CASE_PAYMENT_CHECKOUT_KIND,
  CasePaymentsService,
} from './case-payments.service';

/**
 * Owner 2026-10-22 (audit #4 §10): the money paths of client → attorney
 * payments that the e2e covers only end to end — a paid checkout (once,
 * revival rules, the invoice it pays), disputes and dashboard refunds
 * from Stripe Connect webhooks.
 */
type Row = Record<string, unknown>;

function make(payment: Row) {
  const rows = new Map<string, Row>([[payment.id as string, payment]]);
  const refunds: Row[] = [];
  const requests: Row[] = [];
  const db = {
    casePayment: {
      findUnique: jest.fn(
        ({ where }: { where: { id?: string; stripe_checkout_id?: string } }) =>
          Promise.resolve(
            where.id
              ? (rows.get(where.id) ?? null)
              : ([...rows.values()].find(
                  (r) => r.stripe_checkout_id === where.stripe_checkout_id,
                ) ?? null),
          ),
      ),
      findFirst: jest.fn(({ where }: { where: Row }) =>
        Promise.resolve(
          [...rows.values()].find((r) =>
            Object.entries(where).every(([k, v]) => r[k] === v),
          ) ?? null,
        ),
      ),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: Row }) => {
          const next = { ...rows.get(where.id), ...data };
          rows.set(where.id, next);
          return Promise.resolve(next);
        },
      ),
    },
    paymentRequest: {
      findUnique: jest.fn(() => Promise.resolve({ invoice_id: null })),
      updateMany: jest.fn(({ where, data }: { where: Row; data: Row }) => {
        requests.push({ where, data });
        return Promise.resolve({ count: 1 });
      }),
    },
    casePaymentRefund: {
      create: jest.fn(({ data }: { data: Row }) => {
        refunds.push(data);
        return Promise.resolve(data);
      }),
    },
  };
  const prisma = {
    ...db,
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  };
  const notifications = { emit: jest.fn(() => Promise.resolve()) };
  const provider = {
    retrieveConnectedCheckout: jest.fn(),
    retrieveConnectedCharge: jest.fn(),
  };
  const svc = new CasePaymentsService(
    prisma as never,
    { get: () => undefined } as unknown as ConfigService,
    { isEnabled: jest.fn(() => Promise.resolve(true)) } as never,
    {} as never,
    provider as never,
    notifications as never,
  );
  return { svc, rows, refunds, requests, notifications, provider };
}

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
  refunded_cents: 0,
  request_id: null,
  stripe_charge_id: null,
  disputed_at: null,
  receipt_url: null,
  ...over,
});

const session = (
  over: Partial<ProviderConnectedCheckout> = {},
): ProviderConnectedCheckout => ({
  id: 'cs_1',
  accountId: 'acct_1',
  url: null,
  status: 'complete',
  paymentStatus: 'paid',
  paymentIntentId: 'pi_1',
  chargeId: 'ch_1',
  receiptUrl: 'https://pay.stripe.test/r/1',
  amountTotalCents: 51_500,
  metadata: { kind: CASE_PAYMENT_CHECKOUT_KIND, paymentId: 'cp_1' },
  ...over,
});

const event = (type: string, object: Row): ProviderEvent => ({
  id: `evt_${type}`,
  type,
  created: 0,
  object: { object: 'x', id: 'obj_1', ...object },
});

describe('CasePaymentsService.applyCheckout', () => {
  it('a paid checkout marks the payment succeeded once and tells both sides', async () => {
    const h = make(base());
    expect(await h.svc.applyCheckout(session())).toBe(true);
    expect(h.rows.get('cp_1')).toMatchObject({
      status: 'succeeded',
      stripe_payment_intent_id: 'pi_1',
      stripe_charge_id: 'ch_1',
      client_total_cents: 51_500,
    });
    const types = (h.notifications.emit.mock.calls as unknown[][]).map(
      (c) => (c[0] as { type: string; recipientId: string }).type,
    );
    expect(types).toEqual(['case_payment_received', 'case_payment_sent']);
    // The webhook and the app's return both arrive: no second effect.
    expect(await h.svc.applyCheckout(session())).toBe(false);
    expect(h.notifications.emit).toHaveBeenCalledTimes(2);
  });

  it('paying an invoice marks the request paid and its fee payer agreed', async () => {
    const h = make(base({ request_id: 'req_1' }));
    await h.svc.applyCheckout(session());
    expect(h.requests[0]).toMatchObject({
      where: { id: 'req_1' },
      data: { status: 'paid', payment_id: 'cp_1', fee_payer_status: 'agreed' },
    });
  });

  it('a late payment revives a system-canceled checkout, never a client cancel', async () => {
    const expired = make(
      base({ status: 'canceled', canceled_reason: 'expired' }),
    );
    expect(await expired.svc.applyCheckout(session())).toBe(true);
    const byClient = make(
      base({ status: 'canceled', canceled_reason: 'client' }),
    );
    expect(await byClient.svc.applyCheckout(session())).toBe(false);
  });

  it.each([
    ['another kind', { metadata: { kind: 'bid_pack', paymentId: 'cp_1' } }],
    ['not complete', { status: 'open' as const }],
    ['unpaid', { paymentStatus: 'unpaid' }],
    ['another session', { id: 'cs_2' }],
  ])('ignores %s', async (_n, over) => {
    const h = make(base());
    expect(await h.svc.applyCheckout(session(over))).toBe(false);
    expect(h.rows.get('cp_1')?.status).toBe('pending_payment');
  });
});

describe('CasePaymentsService.handleProviderEvent', () => {
  const paid = () => base({ status: 'succeeded', stripe_charge_id: 'ch_1' });

  it('a new dispute marks the payment and warns the attorney', async () => {
    const h = make(paid());
    await h.svc.handleProviderEvent(
      event('charge.dispute.created', {
        charge: 'ch_1',
        status: 'needs_response',
      }),
    );
    expect(h.rows.get('cp_1')).toMatchObject({
      status: 'disputed',
      dispute_status: 'needs_response',
    });
    expect(h.notifications.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'case_payment_disputed',
        recipientId: 'att_1',
      }),
    );
  });

  it('a lost dispute is a full refund with a refund row; a won one restores', async () => {
    const lost = make(paid());
    await lost.svc.handleProviderEvent(
      event('charge.dispute.closed', { charge: 'ch_1', status: 'lost' }),
    );
    expect(lost.rows.get('cp_1')).toMatchObject({
      status: 'refunded',
      refunded_cents: 51_500,
    });
    expect(lost.refunds[0]).toMatchObject({
      amount_cents: 51_500,
      initiated_by_type: 'stripe',
    });
    const won = make(paid());
    await won.svc.handleProviderEvent(
      event('charge.dispute.closed', { charge: 'ch_1', status: 'won' }),
    );
    expect(won.rows.get('cp_1')?.status).toBe('succeeded');
    expect(won.refunds).toHaveLength(0);
  });

  it('a refund made in the Stripe dashboard is mirrored (partial, then full, never twice)', async () => {
    const h = make(paid());
    h.provider.retrieveConnectedCharge
      .mockResolvedValueOnce({ amountRefundedCents: 10_000, receiptUrl: null })
      .mockResolvedValueOnce({ amountRefundedCents: 10_000, receiptUrl: null })
      .mockResolvedValueOnce({ amountRefundedCents: 51_500, receiptUrl: null });
    const refunded = event('charge.refunded', { _account: 'acct_1' });
    refunded.object.id = 'ch_1';
    await h.svc.handleProviderEvent(refunded);
    expect(h.rows.get('cp_1')).toMatchObject({
      status: 'partially_refunded',
      refunded_cents: 10_000,
    });
    await h.svc.handleProviderEvent(refunded); // same amount: nothing new
    expect(h.refunds).toHaveLength(1);
    await h.svc.handleProviderEvent(refunded);
    expect(h.rows.get('cp_1')).toMatchObject({
      status: 'refunded',
      refunded_cents: 51_500,
    });
    expect(h.refunds.map((r) => r.amount_cents)).toEqual([10_000, 41_500]);
  });

  it('checkout.session.completed re-reads the session on the connected account', async () => {
    const h = make(base());
    h.provider.retrieveConnectedCheckout.mockResolvedValue(session());
    const done = event('checkout.session.completed', {
      metadata: { paymentId: 'cp_1' },
    });
    done.object.id = 'cs_1';
    await h.svc.handleProviderEvent(done);
    expect(h.provider.retrieveConnectedCheckout).toHaveBeenCalledWith(
      'acct_1',
      'cs_1',
    );
    expect(h.rows.get('cp_1')?.status).toBe('succeeded');
  });
});
