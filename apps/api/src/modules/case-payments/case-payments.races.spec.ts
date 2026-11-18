/* eslint-disable @typescript-eslint/require-await -- in-memory fakes */
import type { ConfigService } from '@nestjs/config';
import type { ProviderEvent } from '../billing/payment-provider';
import { CasePaymentsService, refundIdOf } from './case-payments.service';

/**
 * Detective R2 (14.11) R2B-4 / R2B-10: refunds, the `charge.refunded`
 * webhook and payment-request answers used to read the row outside the
 * transaction and write absolute values back, so two of them at once lost
 * an update or booked the same money twice. These tests replay those
 * interleavings on an in-memory table that honours `{ increment }` and
 * conditional `updateMany`, like Postgres does under a row lock.
 */
type Row = Record<string, unknown>;

function matches(r: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return (v as Row[]).some((w) => matches(r, w));
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const op = v as {
        in?: unknown[];
        not?: unknown;
        lt?: number;
      };
      if (op.in) return op.in.includes(r[k]);
      if ('not' in op) return r[k] !== op.not;
      if (op.lt !== undefined) return (r[k] as number) < op.lt;
    }
    return r[k] === v;
  });
}

function apply(row: Row, data: Row): Row {
  const next = { ...row };
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && 'increment' in v) {
      next[k] = (row[k] as number) + (v as { increment: number }).increment;
    } else next[k] = v;
  }
  return next;
}

function make(payment: Row, request?: Row) {
  const payments = new Map<string, Row>([[payment.id as string, payment]]);
  const requests = new Map<string, Row>(
    request ? [[request.id as string, request]] : [],
  );
  const refunds: Row[] = [];
  let seq = 0;
  const table = (m: Map<string, Row>) => ({
    findUnique: jest.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve(m.get(where.id) ? { ...m.get(where.id) } : null),
    ),
    findUniqueOrThrow: jest.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve({ ...m.get(where.id) }),
    ),
    findFirst: jest.fn(({ where }: { where: Row }) => {
      const r = [...m.values()].find((x) => matches(x, where));
      return Promise.resolve(r ? { ...r } : null);
    }),
    update: jest.fn(({ where, data }: { where: { id: string }; data: Row }) => {
      const next = apply(m.get(where.id) as Row, data);
      m.set(where.id, next);
      return Promise.resolve({ ...next });
    }),
    updateMany: jest.fn(({ where, data }: { where: Row; data: Row }) => {
      let count = 0;
      for (const [id, r] of m) {
        if (!matches(r, where)) continue;
        m.set(id, apply(r, data));
        count += 1;
      }
      return Promise.resolve({ count });
    }),
  });
  const db = {
    casePayment: table(payments),
    paymentRequest: table(requests),
    casePaymentRefund: {
      create: jest.fn(({ data }: { data: Row }) => {
        const r = { id: `rf_${++seq}`, stripe_refund_id: null, ...data };
        refunds.push(r);
        return Promise.resolve({ ...r });
      }),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: Row }) => {
          const r = refunds.find((x) => x.id === where.id) as Row;
          Object.assign(r, data);
          return Promise.resolve({ ...r });
        },
      ),
      updateMany: jest.fn(({ where, data }: { where: Row; data: Row }) => {
        const hit = refunds.filter((r) => matches(r, where));
        for (const r of hit) Object.assign(r, data);
        return Promise.resolve({ count: hit.length });
      }),
      findUnique: jest.fn(({ where }: { where: { id: string } }) => {
        const r = refunds.find((x) => x.id === where.id);
        return Promise.resolve(r ? { ...r } : null);
      }),
      findFirst: jest.fn(({ where }: { where: Row }) => {
        const r = refunds.find((x) => matches(x, where));
        return Promise.resolve(r ? { ...r } : null);
      }),
      aggregate: jest.fn(({ where }: { where: Row }) => {
        const sum = refunds
          .filter((r) => matches(r, where))
          .reduce((s, r) => s + (r.amount_cents as number), 0);
        return Promise.resolve({ _sum: { amount_cents: sum } });
      }),
    },
    $queryRaw: jest.fn(() => Promise.resolve([])),
    user: { findMany: jest.fn(() => Promise.resolve([])) },
    case: { findMany: jest.fn(() => Promise.resolve([])) },
    appConfig: {
      findUnique: jest.fn(() => Promise.resolve(null)),
      findMany: jest.fn(() => Promise.resolve([])),
    },
  };
  const prisma = {
    ...db,
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  };
  const ledger = {
    casePaymentRefunded: jest.fn(() => Promise.resolve()),
  };
  const provider: Record<string, jest.Mock> = {
    refundConnected: jest.fn(),
    retrieveConnectedCharge: jest.fn(),
  };
  const svc = new CasePaymentsService(
    prisma as never,
    { get: () => undefined } as unknown as ConfigService,
    { isEnabled: jest.fn(() => Promise.resolve(true)) } as never,
    { avatarUrlsMany: jest.fn(() => Promise.resolve(new Map())) } as never,
    provider as never,
    { emit: jest.fn(() => Promise.resolve()) } as never,
  );
  (svc as unknown as { ledger: unknown }).ledger = ledger;
  return { svc, payments, requests, refunds, ledger, provider, db };
}

const paid = (over: Row = {}): Row => ({
  id: 'cp_1',
  case_id: 'case_1',
  attorney_id: 'att_1',
  client_id: 'cli_1',
  stripe_account_id: 'acct_1',
  stripe_payment_intent_id: 'pi_1',
  stripe_charge_id: 'ch_1',
  status: 'succeeded',
  amount_cents: 50_000,
  client_total_cents: 50_000,
  refunded_cents: 0,
  receipt_url: null,
  paid_at: new Date(),
  ...over,
});

const chargeRefunded: ProviderEvent = {
  id: 'evt_1',
  type: 'charge.refunded',
  created: 0,
  object: { object: 'charge', id: 'ch_1', _account: 'acct_1' },
};

const by = { type: 'admin' as const, id: null };

describe('CasePaymentsService refunds under concurrency (R2B-4)', () => {
  it('the charge.refunded webhook arriving mid-refund books the money once', async () => {
    const h = make(paid());
    h.provider.refundConnected.mockImplementation(async () => {
      // Stripe has refunded and sends the webhook before our call returns.
      h.provider.retrieveConnectedCharge.mockResolvedValue({
        amountRefundedCents: 10_000,
        receiptUrl: null,
      });
      await h.svc.handleProviderEvent(chargeRefunded);
      return { id: 're_1', status: 'succeeded', failureReason: null };
    });
    await h.svc.refundPayment(
      h.payments.get('cp_1') as never,
      {
        amountCents: 10_000,
        reason: 'x',
      },
      by,
    );
    expect(h.payments.get('cp_1')?.refunded_cents).toBe(10_000);
    expect(h.refunds.filter((r) => r.status !== 'failed')).toHaveLength(1);
    expect(h.ledger.casePaymentRefunded).toHaveBeenCalledTimes(1);
  });

  it('two partial refunds from the same stale row both count', async () => {
    const h = make(paid());
    const stale = { ...h.payments.get('cp_1') } as never;
    let n = 0;
    h.provider.refundConnected.mockImplementation(async () => ({
      id: `re_${++n}`,
      status: 'succeeded',
      failureReason: null,
    }));
    await Promise.all([
      h.svc.refundPayment(stale, { amountCents: 10_000, reason: 'a' }, by),
      h.svc.refundPayment(stale, { amountCents: 15_000, reason: 'b' }, by),
    ]);
    expect(h.payments.get('cp_1')).toMatchObject({
      refunded_cents: 25_000,
      status: 'partially_refunded',
    });
  });

  it('a refund in flight is reserved: a second one cannot exceed the rest', async () => {
    const h = make(paid());
    const stale = { ...h.payments.get('cp_1') } as never;
    let second: Promise<unknown> | null = null;
    h.provider.refundConnected.mockResolvedValue({
      id: 're_2',
      status: 'succeeded',
      failureReason: null,
    });
    h.provider.refundConnected.mockImplementationOnce(async () => {
      second = h.svc.refundPayment(
        stale,
        { amountCents: 20_000, reason: 'b' },
        by,
      );
      await second.catch(() => undefined);
      return { id: 're_1', status: 'succeeded', failureReason: null };
    });
    await h.svc.refundPayment(stale, { amountCents: 40_000, reason: 'a' }, by);
    await expect(second).rejects.toMatchObject({
      response: { code: 'REFUND_AMOUNT_EXCEEDED' },
    });
    expect(h.payments.get('cp_1')?.refunded_cents).toBe(40_000);
  });

  it('a dashboard refund on top of an app refund adds only the difference', async () => {
    const h = make(
      paid({ refunded_cents: 10_000, status: 'partially_refunded' }),
    );
    h.refunds.push({
      id: 'rf_app',
      payment_id: 'cp_1',
      amount_cents: 10_000,
      status: 'succeeded',
      stripe_refund_id: 're_app',
    });
    h.provider.retrieveConnectedCharge.mockResolvedValue({
      amountRefundedCents: 25_000,
      receiptUrl: null,
    });
    await h.svc.handleProviderEvent(chargeRefunded);
    await h.svc.handleProviderEvent(chargeRefunded);
    expect(h.payments.get('cp_1')?.refunded_cents).toBe(25_000);
    expect(h.ledger.casePaymentRefunded).toHaveBeenCalledTimes(1);
  });
});

describe('CasePaymentsService payment requests under concurrency (R2B-10)', () => {
  const req = (over: Row = {}): Row => ({
    id: 'req_1',
    case_id: 'case_1',
    attorney_id: 'att_1',
    client_id: 'cli_1',
    amount_cents: 50_000,
    status: 'open',
    processing_fee_payer: 'client',
    fee_payer_status: 'proposed',
    fee_payer_by: 'attorney',
    fee_payer_rounds: 0,
    created_at: new Date(),
    ...over,
  });
  const attorney = { sub: 'att_1', role: 'attorney' } as never;
  const client = { sub: 'cli_1', role: 'client' } as never;

  it('a request paid while the attorney cancels stays paid', async () => {
    const h = make(paid(), req());
    // The checkout webhook marks it paid between the read and the write.
    h.db.paymentRequest.findUnique.mockImplementationOnce(async () => {
      const snap = { ...h.requests.get('req_1') };
      h.requests.set('req_1', { ...snap, status: 'paid' });
      return snap;
    });
    await expect(h.svc.cancelRequest(attorney, 'req_1')).rejects.toMatchObject({
      response: { code: 'PAYMENT_INVALID_STATE' },
    });
    expect(h.requests.get('req_1')?.status).toBe('paid');
  });

  it('a counter-offer raced past the rounds cap is refused', async () => {
    const h = make(paid(), req({ fee_payer_rounds: 0 }));
    jest
      .spyOn(
        h.svc as unknown as { settings: () => Promise<unknown> },
        'settings',
      )
      .mockResolvedValue({ feePayerMaxRounds: 1, refundWindowDays: 0 });
    h.db.paymentRequest.findUnique.mockImplementationOnce(async () => {
      const snap = { ...h.requests.get('req_1') };
      // The other answer already used the last round.
      h.requests.set('req_1', {
        ...snap,
        fee_payer_rounds: 1,
        fee_payer_by: 'client',
        processing_fee_payer: 'attorney',
        fee_payer_status: 'countered',
      });
      return snap;
    });
    await expect(
      h.svc.answerFeePayer(client, 'req_1', {
        action: 'counter',
        processingFeePayer: 'attorney',
      } as never),
    ).rejects.toMatchObject({ response: { code: 'PAYMENT_INVALID_STATE' } });
    expect(h.requests.get('req_1')?.fee_payer_rounds).toBe(1);
  });
});

/**
 * Row 177 (15.11): the admin's Idempotency-Key picks the refund row id and
 * so the Stripe idempotency key. These replay the retries that used to
 * send a second Stripe refund: each old try got a fresh refund row, so a
 * fresh Stripe key.
 */
describe('CasePaymentsService refunds keyed by the request (row 177)', () => {
  const admin = { type: 'admin' as const, id: 'adm_1' };
  type H = ReturnType<typeof make>;

  /** Like Postgres: every transaction here starts with `SELECT … FOR
   * UPDATE` on the one payment row, so they run one after another, and a
   * throw rolls the transaction back. */
  function likePostgres(h: H) {
    const prisma = (h.svc as unknown as { prisma: { $transaction: jest.Mock } })
      .prisma;
    let rowLock: Promise<unknown> = Promise.resolve();
    prisma.$transaction.mockImplementation(
      (fn: (tx: unknown) => Promise<unknown>) => {
        const run = rowLock.then(async () => {
          const payments = new Map(
            [...h.payments].map(([k, v]) => [k, { ...v }]),
          );
          const refunds = h.refunds.map((r) => ({ ...r }));
          try {
            return await fn(h.db);
          } catch (e) {
            h.payments.clear();
            for (const [k, v] of payments) h.payments.set(k, v);
            h.refunds.splice(0, h.refunds.length, ...refunds);
            throw e;
          }
        });
        rowLock = run.catch(() => undefined);
        return run;
      },
    );
  }

  type Call = { idempotencyKey: string; amountCents: number };

  /** Stripe's idempotency: one key → one refund, the same answer back. */
  function stripeLike(h: H) {
    const seen = new Map<string, string>();
    const call = async (a: Call) => {
      let id = seen.get(a.idempotencyKey);
      if (!id) {
        id = `re_${seen.size + 1}`;
        seen.set(a.idempotencyKey, id);
      }
      return { id, status: 'succeeded', failureReason: null };
    };
    h.provider.refundConnected.mockImplementation(call);
    return { seen, call };
  }

  const keys = (h: H) =>
    h.provider.refundConnected.mock.calls.map(
      (c) => (c[0] as Call).idempotencyKey,
    );
  const row = (h: H) => h.payments.get('cp_1') as never;

  it('a retry after a Stripe timeout sends the same Stripe key', async () => {
    const h = make(paid());
    likePostgres(h);
    const { seen, call } = stripeLike(h);
    // Stripe refunded, but the answer never reached us.
    h.provider.refundConnected.mockImplementationOnce(async (a: Call) => {
      await call(a);
      throw new Error('socket hang up');
    });
    const dto = { amountCents: 10_000, reason: 'a' };
    await expect(
      h.svc.refundPayment(row(h), dto, admin, { requestKey: 'k-1' }),
    ).rejects.toMatchObject({ response: { code: 'REFUND_PROVIDER_FAILED' } });
    await h.svc.refundPayment(row(h), dto, admin, { requestKey: 'k-1' });
    const [k1, k2] = keys(h);
    expect(k1).toBe(k2);
    expect(seen.size).toBe(1);
    expect(h.payments.get('cp_1')?.refunded_cents).toBe(10_000);
    expect(h.ledger.casePaymentRefunded).toHaveBeenCalledTimes(1);
  });

  it('a retry after a lost commit books the first Stripe refund once', async () => {
    const h = make(paid());
    likePostgres(h);
    const { seen } = stripeLike(h);
    h.ledger.casePaymentRefunded.mockRejectedValueOnce(new Error('db gone'));
    const dto = { amountCents: 10_000, reason: 'a' };
    await expect(
      h.svc.refundPayment(row(h), dto, admin, { requestKey: 'k-1' }),
    ).rejects.toThrow('db gone');
    await h.svc.refundPayment(row(h), dto, admin, { requestKey: 'k-1' });
    expect(seen.size).toBe(1);
    expect(h.payments.get('cp_1')).toMatchObject({
      refunded_cents: 10_000,
      status: 'partially_refunded',
    });
    expect(h.refunds.filter((r) => r.status !== 'failed')).toHaveLength(1);
  });

  it('two simultaneous tries of one click move the money once', async () => {
    const h = make(paid());
    likePostgres(h);
    const { seen } = stripeLike(h);
    const stale = { ...h.payments.get('cp_1') } as never;
    const dto = { amountCents: 10_000, reason: 'a' };
    await Promise.all([
      h.svc.refundPayment(stale, dto, admin, { requestKey: 'k-1' }),
      h.svc.refundPayment(stale, dto, admin, { requestKey: 'k-1' }),
    ]);
    expect(seen.size).toBe(1);
    expect(h.payments.get('cp_1')?.refunded_cents).toBe(10_000);
    expect(h.ledger.casePaymentRefunded).toHaveBeenCalledTimes(1);
  });

  it('a replay of a booked click does not call Stripe again', async () => {
    const h = make(paid());
    likePostgres(h);
    stripeLike(h);
    const dto = { amountCents: 10_000, reason: 'a' };
    await h.svc.refundPayment(row(h), dto, admin, { requestKey: 'k-1' });
    const again = await h.svc.refundPayment(row(h), dto, admin, {
      requestKey: 'k-1',
    });
    expect(h.provider.refundConnected).toHaveBeenCalledTimes(1);
    expect(again).toMatchObject({ refunded_cents: 10_000 });
  });

  it('the same key with another amount is refused', async () => {
    const h = make(paid());
    likePostgres(h);
    stripeLike(h);
    await h.svc.refundPayment(
      row(h),
      { amountCents: 10_000, reason: 'a' },
      admin,
      { requestKey: 'k-1' },
    );
    await expect(
      h.svc.refundPayment(row(h), { amountCents: 12_000, reason: 'a' }, admin, {
        requestKey: 'k-1',
      }),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_CONFLICT' } });
    expect(h.payments.get('cp_1')?.refunded_cents).toBe(10_000);
  });

  it('two different clicks at once are two refunds, both counted', async () => {
    const h = make(paid());
    likePostgres(h);
    const { seen } = stripeLike(h);
    const stale = { ...h.payments.get('cp_1') } as never;
    await Promise.all([
      h.svc.refundPayment(stale, { amountCents: 10_000, reason: 'a' }, admin, {
        requestKey: 'k-1',
      }),
      h.svc.refundPayment(stale, { amountCents: 15_000, reason: 'b' }, admin, {
        requestKey: 'k-2',
      }),
    ]);
    expect(seen.size).toBe(2);
    expect(h.payments.get('cp_1')).toMatchObject({
      refunded_cents: 25_000,
      status: 'partially_refunded',
    });
  });

  it('verify 17.11: an attorney refund (no request key) that timed out is sent again with the same key, once', async () => {
    const h = make(paid());
    likePostgres(h);
    const { seen, call } = stripeLike(h);
    const attorney = { type: 'attorney' as const, id: 'att_1' };
    // Stripe refunded, but the connection broke before the answer.
    h.provider.refundConnected.mockImplementationOnce(async (a: Call) => {
      await call(a);
      throw Object.assign(new Error('socket hang up'), {
        type: 'StripeConnectionError',
      });
    });
    const dto = { amountCents: 10_000, reason: 'a' };
    await expect(
      h.svc.refundPayment(row(h), dto, attorney),
    ).rejects.toMatchObject({ response: { code: 'REFUND_PROVIDER_FAILED' } });
    // The money may have moved: the row stays reserved.
    expect(h.refunds.map((r) => r.status)).toEqual(['pending']);
    await h.svc.refundPayment(row(h), dto, attorney);
    const [k1, k2] = keys(h);
    expect(k2).toBe(k1);
    expect(seen.size).toBe(1);
    expect(h.refunds).toHaveLength(1);
    expect(h.payments.get('cp_1')?.refunded_cents).toBe(10_000);
    expect(h.ledger.casePaymentRefunded).toHaveBeenCalledTimes(1);
  });

  it('verify 17.11: a definite Stripe refusal (4xx) still frees the reservation', async () => {
    const h = make(paid());
    likePostgres(h);
    h.provider.refundConnected.mockRejectedValueOnce(
      Object.assign(new Error('charge_already_refunded'), {
        type: 'StripeInvalidRequestError',
        statusCode: 400,
      }),
    );
    await expect(
      h.svc.refundPayment(
        row(h),
        { amountCents: 10_000, reason: 'a' },
        {
          type: 'attorney',
          id: 'att_1',
        },
      ),
    ).rejects.toMatchObject({ response: { code: 'REFUND_PROVIDER_FAILED' } });
    expect(h.refunds.map((r) => r.status)).toEqual(['failed']);
  });

  it('one id per payment, person and key', () => {
    const a = refundIdOf('cp_1', admin, 'k-1');
    expect(refundIdOf('cp_1', admin, 'k-1')).toBe(a);
    expect(refundIdOf('cp_1', admin, 'k-2')).not.toBe(a);
    expect(refundIdOf('cp_2', admin, 'k-1')).not.toBe(a);
    expect(refundIdOf('cp_1', { type: 'admin', id: 'adm_2' }, 'k-1')).not.toBe(
      a,
    );
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab]/);
  });
});
