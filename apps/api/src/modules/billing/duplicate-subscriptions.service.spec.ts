import { randomUUID } from 'node:crypto';
import { DuplicateSubscriptionsService } from './duplicate-subscriptions.service';
import { FakePaymentProvider } from './fake-payment.provider';
import type { ProviderSubscription } from './payment-provider';

/**
 * Algo audit M-4 (owner 2026-10-28): the duplicate-subscription auto-fix
 * against the fake Stripe and a small in-memory database (the e2e suite
 * owner-duplicate-subscriptions runs it on PostgreSQL).
 */

const DAY = 86_400;
const nowSec = () => Math.floor(Date.now() / 1000);

type Row = Record<string, unknown> & { id: string };

function matches(row: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'AND')
      return (v as Record<string, unknown>[]).every((w) => matches(row, w));
    if (k === 'NOT') return !matches(row, v as Record<string, unknown>);
    const val = row[k];
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const o = v as Record<string, unknown>;
      if ('in' in o) return (o.in as unknown[]).includes(val);
      if ('notIn' in o) return !(o.notIn as unknown[]).includes(val);
      if ('not' in o) return val !== o.not;
      if ('gte' in o) return (val as Date) >= (o.gte as Date);
      return true;
    }
    return val === v;
  });
}

function table(rows: Row[] = []) {
  return {
    rows,
    findUnique: jest.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(rows.find((r) => matches(r, where)) ?? null),
    ),
    findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        [...rows].reverse().find((r) => matches(r, where)) ?? null,
      ),
    ),
    findMany: jest.fn(({ where }: { where?: Record<string, unknown> } = {}) =>
      Promise.resolve(rows.filter((r) => matches(r, where))),
    ),
    count: jest.fn(({ where }: { where?: Record<string, unknown> } = {}) =>
      Promise.resolve(rows.filter((r) => matches(r, where)).length),
    ),
    create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
      const key = data.duplicate_subscription_id;
      if (key && rows.some((r) => r.duplicate_subscription_id === key)) {
        return Promise.reject(
          Object.assign(new Error('dup'), { code: 'P2002' }),
        );
      }
      const row: Row = {
        id: randomUUID(),
        created_at: new Date(),
        updated_at: new Date(),
        reason: null,
        refund_cents: 0,
        payment_id: null,
        refund_id: null,
        canceled_at: null,
        ...data,
      };
      rows.push(row);
      return Promise.resolve({ ...row });
    }),
    update: jest.fn(
      ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const row = rows.find((r) => matches(r, where));
        if (!row) return Promise.reject(new Error('not found'));
        Object.assign(row, data, { updated_at: new Date() });
        return Promise.resolve({ ...row });
      },
    ),
    updateMany: jest.fn(
      ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const hit = rows.filter((r) => matches(r, where));
        for (const r of hit) Object.assign(r, data);
        return Promise.resolve({ count: hit.length });
      },
    ),
    aggregate: jest.fn(
      ({
        where,
        _sum,
      }: {
        where: Record<string, unknown>;
        _sum: Record<string, true>;
      }) => {
        const field = Object.keys(_sum)[0];
        const sum = rows
          .filter((r) => matches(r, where))
          .reduce((s, r) => s + Number(r[field] ?? 0), 0);
        return Promise.resolve({ _sum: { [field]: sum } });
      },
    ),
  };
}

function setup(opts: { settings?: Record<string, unknown> } = {}) {
  const userId = randomUUID();
  const customerId = `cus_${userId.slice(0, 8)}`;
  const db = {
    subscription: table(),
    stripeCustomer: table([
      { id: 'c', user_id: userId, stripe_customer_id: customerId },
    ]),
    billingDuplicateFix: table(),
    payment: table(),
    refund: table(),
    stripeReviewItem: table(),
    user: table([{ id: userId, status: 'active' }]),
    clientFraudProfile: table(),
    attorneyProfile: table([
      { id: 'p', user_id: userId, verification_status: 'verified' },
    ]),
  };
  const prisma = Object.assign({}, db, {
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  });
  const settings = {
    'billing.duplicate_subscription_autofix': true,
    'billing.duplicate_autorefund_daily_cap_cents': 50_000,
    ...opts.settings,
  };
  const appSettings = {
    boolean: jest.fn((k: string) =>
      Promise.resolve(Boolean(settings[k as keyof typeof settings])),
    ),
    number: jest.fn((k: string) =>
      Promise.resolve(Number(settings[k as keyof typeof settings])),
    ),
  };
  const fake = new FakePaymentProvider();
  const cancelSpy = jest.spyOn(fake, 'cancelNow');
  const stripeRefunds: { key: string; cents: number }[] = [];
  const refunds = {
    refundBySystem: jest.fn(
      (
        dto: { paymentId: string; amountCents: number; reason: string },
        o: { idempotencyKey?: string },
      ): Promise<{ id: string; status: string }> => {
        const row: Row = {
          id: randomUUID(),
          payment_id: dto.paymentId,
          amount_cents: dto.amountCents,
          reason: dto.reason,
          status: 'pending',
          stripe_refund_id: null,
          created_at: new Date(),
        };
        db.refund.rows.push(row);
        stripeRefunds.push({ key: o.idempotencyKey!, cents: dto.amountCents });
        Object.assign(row, {
          status: 'succeeded',
          stripe_refund_id: `re_${row.id}`,
        });
        return Promise.resolve({ id: row.id, status: 'succeeded' });
      },
    ),
  };
  const sync = {
    setForeignSubscriptionHook: jest.fn(),
    apply: jest.fn(() => Promise.resolve(null)),
  };
  const review = {
    open: jest.fn(() => Promise.resolve({})),
    notifyStaff: jest.fn(() => Promise.resolve()),
  };
  const audit = { record: jest.fn(() => Promise.resolve()) };
  const ops = { noteBillingDuplicate: jest.fn(() => Promise.resolve()) };
  const redisStore = new Map<string, string>();
  const redis = {
    set: jest.fn((k: string, v: string) => {
      if (redisStore.has(k)) return Promise.resolve(null);
      redisStore.set(k, v);
      return Promise.resolve('OK');
    }),
    eval: jest.fn((_s: string, _n: number, k: string, v: string) => {
      if (redisStore.get(k) === v) redisStore.delete(k);
      return Promise.resolve(1);
    }),
  };
  const svc = new DuplicateSubscriptionsService(
    prisma as never,
    fake,
    appSettings as never,
    sync as never,
    { invalidate: jest.fn(() => Promise.resolve()) } as never,
    redis as never,
    refunds as never,
    review as never,
    audit as never,
    ops as never,
  );

  /** A live subscription at the fake with (optionally) a paid last invoice. */
  function stripeSub(p: {
    startDaysAgo: number;
    status?: ProviderSubscription['status'];
    paidCents?: number;
    customer?: string;
    userMeta?: string;
    createdDaysAgo?: number;
  }) {
    const id = `sub_${randomUUID().slice(0, 10)}`;
    const start = nowSec() - p.startDaysAgo * DAY;
    let invoiceId: string | null = null;
    if (p.paidCents !== undefined) {
      invoiceId = `in_${randomUUID().slice(0, 10)}`;
      const pi = `pi_${randomUUID().slice(0, 10)}`;
      fake.invoices.set(invoiceId, {
        id: invoiceId,
        customerId: p.customer ?? customerId,
        subscriptionId: id,
        amountCents: p.paidCents,
        currency: 'usd',
        status: p.paidCents > 0 ? 'paid' : 'open',
        paidAt: start,
        paymentIntentId: pi,
        failureCode: null,
        _version: 0,
      });
      if (p.paidCents > 0) {
        db.payment.rows.push({
          id: randomUUID(),
          user_id: userId,
          stripe_invoice_id: invoiceId,
          stripe_payment_intent_id: pi,
          amount_cents: p.paidCents,
          status: 'succeeded',
        });
      }
    }
    fake.subscriptions.set(id, {
      id,
      customerId: p.customer ?? customerId,
      status: p.status ?? 'active',
      trialStart: null,
      trialEnd: null,
      currentPeriodStart: start,
      currentPeriodEnd: start + 30 * DAY,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      defaultPaymentMethodId: 'pm',
      metadata: { userId: p.userMeta ?? userId },
      latestInvoiceId: invoiceId,
      created: nowSec() - (p.createdDaysAgo ?? p.startDaysAgo) * DAY,
      _version: 0,
    });
    return { id, invoiceId };
  }

  function row(stripeId: string, status = 'active') {
    db.subscription.rows.push({
      id: randomUUID(),
      user_id: userId,
      stripe_subscription_id: stripeId,
      status,
    });
  }

  return {
    svc,
    db,
    fake,
    cancelSpy,
    refunds,
    stripeRefunds,
    review,
    audit,
    ops,
    sync,
    userId,
    customerId,
    stripeSub,
    row,
    fix: (dup: string) =>
      db.billingDuplicateFix.rows.find(
        (r) => r.duplicate_subscription_id === dup,
      ),
  };
}

describe('DuplicateSubscriptionsService', () => {
  it('a single subscription is not a duplicate', async () => {
    const t = setup();
    const a = t.stripeSub({ startDaysAgo: 3, paidCents: 39_900 });
    t.row(a.id);
    const r = await t.svc.resolve(t.userId, { trigger: 'webhook' });
    expect(r).toEqual({ keeperId: a.id, canceled: [], outcome: 'none' });
    expect(t.cancelSpy).not.toHaveBeenCalled();
  });

  it('second device: keeps the newest paid, cancels the old one first, refunds only its unused remainder', async () => {
    const t = setup();
    const old = t.stripeSub({ startDaysAgo: 10, paidCents: 30_000 });
    const fresh = t.stripeSub({ startDaysAgo: 0, paidCents: 30_000 });
    t.row(old.id);
    const r = await t.svc.resolve(t.userId, {
      trigger: 'app_order',
      include: [fresh.id],
    });
    expect(r.keeperId).toBe(fresh.id);
    expect(r.canceled).toEqual([old.id]);
    expect(t.fake.subscriptions.get(old.id)!.status).toBe('canceled');
    expect(t.fake.subscriptions.get(fresh.id)!.status).toBe('active');
    expect(t.cancelSpy).toHaveBeenCalledWith(old.id, {
      idempotencyKey: `dupsub:${old.id}:cancel`,
    });
    // ~20 of 30 days unused; never above the charge.
    const fix = t.fix(old.id)!;
    expect(fix.status).toBe('refunded');
    expect(fix.refund_cents).toBeGreaterThan(19_900);
    expect(fix.refund_cents).toBeLessThanOrEqual(20_000);
    expect(t.stripeRefunds).toEqual([
      { key: `dupsub:${old.id}:refund`, cents: fix.refund_cents },
    ]);
    // Cancel before refund; the attorney's row follows the kept one.
    expect(t.cancelSpy.mock.invocationCallOrder[0]).toBeLessThan(
      t.refunds.refundBySystem.mock.invocationCallOrder[0],
    );
    expect(t.db.subscription.rows[0].stripe_subscription_id).toBe(fresh.id);
    expect(t.sync.apply).toHaveBeenCalledWith(
      expect.objectContaining({ id: fresh.id }),
      {},
      { notify: false },
    );
    // The kept subscription is never refunded.
    const keptPayment = t.db.payment.rows.find(
      (p) => p.stripe_invoice_id === fresh.invoiceId,
    )!;
    expect(t.db.refund.rows.some((x) => x.payment_id === keptPayment.id)).toBe(
      false,
    );
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'system.billing.duplicate_subscription.refunded',
      }),
    );
    expect(t.ops.noteBillingDuplicate).toHaveBeenCalledWith(
      'fixed',
      fix.refund_cents,
    );
    expect(t.review.notifyStaff).toHaveBeenCalled();
  });

  it('a retried / out-of-order webhook does nothing twice', async () => {
    const t = setup();
    const old = t.stripeSub({ startDaysAgo: 10, paidCents: 30_000 });
    const fresh = t.stripeSub({ startDaysAgo: 0, paidCents: 30_000 });
    t.row(old.id);
    await t.svc.resolve(t.userId, { trigger: 'webhook', include: [fresh.id] });
    await t.svc.resolve(t.userId, { trigger: 'webhook', include: [old.id] });
    await t.svc.resolve(t.userId, { trigger: 'webhook', include: [fresh.id] });
    expect(t.cancelSpy).toHaveBeenCalledTimes(1);
    expect(t.refunds.refundBySystem).toHaveBeenCalledTimes(1);
    expect(t.db.billingDuplicateFix.rows).toHaveLength(1);
    expect(t.fake.subscriptions.get(fresh.id)!.status).toBe('active');
  });

  it('a crash after the refund row: the retry does not send a second refund', async () => {
    const t = setup();
    const old = t.stripeSub({ startDaysAgo: 10, paidCents: 30_000 });
    const fresh = t.stripeSub({ startDaysAgo: 0, paidCents: 30_000 });
    t.row(old.id);
    // The refund went out, then the process died before the fix row moved on.
    t.refunds.refundBySystem.mockImplementationOnce((dto, o) => {
      t.db.refund.rows.push({
        id: randomUUID(),
        payment_id: dto.paymentId,
        amount_cents: dto.amountCents,
        reason: dto.reason,
        status: 'succeeded',
        stripe_refund_id: 're_1',
        created_at: new Date(),
      });
      t.stripeRefunds.push({ key: o.idempotencyKey!, cents: dto.amountCents });
      return Promise.reject(new Error('process died'));
    });
    await t.svc.resolve(t.userId, { trigger: 'webhook', include: [fresh.id] });
    expect(t.fix(old.id)!.status).toBe('refunded');
    await t.svc.resolve(t.userId, { trigger: 'webhook', include: [fresh.id] });
    expect(t.stripeRefunds).toHaveLength(1);
  });

  it('grace re-subscription: the stale old one is cancelled without a refund', async () => {
    const t = setup();
    // Paid 40 days ago, retrying its card since (past_due at Stripe).
    const stale = t.stripeSub({
      startDaysAgo: 40,
      paidCents: 30_000,
      status: 'past_due',
    });
    const fresh = t.stripeSub({ startDaysAgo: 0, paidCents: 30_000 });
    t.row(fresh.id);
    const r = await t.svc.resolve(t.userId, {
      trigger: 'grace_resubscribe',
      include: [stale.id],
    });
    expect(r.keeperId).toBe(fresh.id);
    expect(t.fake.subscriptions.get(stale.id)!.status).toBe('canceled');
    expect(t.fix(stale.id)).toMatchObject({
      status: 'no_refund',
      reason: 'period_over',
    });
    expect(t.refunds.refundBySystem).not.toHaveBeenCalled();
  });

  it('a past_due one never stays over a healthy unpaid newcomer', async () => {
    const t = setup();
    const stale = t.stripeSub({ startDaysAgo: 40, status: 'past_due' });
    const fresh = t.stripeSub({ startDaysAgo: 0, status: 'trialing' });
    t.row(fresh.id);
    const r = await t.svc.resolve(t.userId, {
      trigger: 'webhook',
      include: [stale.id],
    });
    expect(r.keeperId).toBe(fresh.id);
    expect(t.fix(stale.id)).toMatchObject({
      status: 'no_refund',
      reason: 'no_charge',
    });
  });

  it('a disputed charge is cancelled but not refunded (held for a person)', async () => {
    const t = setup();
    const old = t.stripeSub({ startDaysAgo: 10, paidCents: 30_000 });
    const fresh = t.stripeSub({ startDaysAgo: 0, paidCents: 30_000 });
    t.row(old.id);
    t.fake.disputedIntents.add(
      t.fake.invoices.get(old.invoiceId!)!.paymentIntentId!,
    );
    await t.svc.resolve(t.userId, { trigger: 'webhook', include: [fresh.id] });
    expect(t.fake.subscriptions.get(old.id)!.status).toBe('canceled');
    expect(t.fix(old.id)).toMatchObject({
      status: 'review',
      reason: 'dispute',
    });
    expect(t.refunds.refundBySystem).not.toHaveBeenCalled();
    expect(t.review.open).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'duplicate_subscription',
        stripeRef: old.id,
      }),
    );
  });

  it('an earlier chargeback on the account also stops the refund', async () => {
    const t = setup();
    const old = t.stripeSub({ startDaysAgo: 10, paidCents: 30_000 });
    const fresh = t.stripeSub({ startDaysAgo: 0, paidCents: 30_000 });
    t.row(old.id);
    t.db.stripeReviewItem.rows.push({
      id: 'x',
      user_id: t.userId,
      kind: 'dispute',
    });
    await t.svc.resolve(t.userId, { trigger: 'webhook', include: [fresh.id] });
    expect(t.fix(old.id)).toMatchObject({
      status: 'review',
      reason: 'dispute',
    });
  });

  it('an account under fraud review gets no automatic refund', async () => {
    const t = setup();
    const old = t.stripeSub({ startDaysAgo: 10, paidCents: 30_000 });
    const fresh = t.stripeSub({ startDaysAgo: 0, paidCents: 30_000 });
    t.row(old.id);
    t.db.clientFraudProfile.rows.push({
      id: 'f',
      user_id: t.userId,
      status: 'review',
    });
    await t.svc.resolve(t.userId, { trigger: 'webhook', include: [fresh.id] });
    expect(t.fix(old.id)).toMatchObject({
      status: 'review',
      reason: 'fraud_review',
    });
    expect(t.refunds.refundBySystem).not.toHaveBeenCalled();
  });

  it('never touches a subscription of another customer or user', async () => {
    const t = setup();
    const mine = t.stripeSub({ startDaysAgo: 10, paidCents: 30_000 });
    const foreignCustomer = t.stripeSub({
      startDaysAgo: 0,
      paidCents: 30_000,
      customer: 'cus_someone_else',
    });
    const foreignUser = t.stripeSub({
      startDaysAgo: 0,
      paidCents: 30_000,
      userMeta: randomUUID(),
    });
    t.row(mine.id);
    const r = await t.svc.resolve(t.userId, {
      trigger: 'webhook',
      include: [foreignCustomer.id, foreignUser.id],
    });
    expect(r.outcome).toBe('none');
    expect(t.cancelSpy).not.toHaveBeenCalled();
    expect(t.fake.subscriptions.get(foreignCustomer.id)!.status).toBe('active');
  });

  it('above the daily cap the refund waits for a person', async () => {
    const t = setup({
      settings: { 'billing.duplicate_autorefund_daily_cap_cents': 10_000 },
    });
    const old = t.stripeSub({ startDaysAgo: 10, paidCents: 30_000 });
    const fresh = t.stripeSub({ startDaysAgo: 0, paidCents: 30_000 });
    t.row(old.id);
    await t.svc.resolve(t.userId, { trigger: 'webhook', include: [fresh.id] });
    expect(t.fake.subscriptions.get(old.id)!.status).toBe('canceled');
    expect(t.fix(old.id)).toMatchObject({
      status: 'review',
      reason: 'daily_cap',
    });
    expect(t.refunds.refundBySystem).not.toHaveBeenCalled();
    expect(t.ops.noteBillingDuplicate).toHaveBeenCalledWith('needsReview');
  });

  it('the third duplicate in 90 days: nothing automatic, the owner is alerted', async () => {
    const t = setup();
    for (let i = 0; i < 2; i++) {
      t.db.billingDuplicateFix.rows.push({
        id: randomUUID(),
        user_id: t.userId,
        duplicate_subscription_id: `sub_earlier_${i}`,
        status: 'refunded',
        created_at: new Date(Date.now() - 10 * DAY * 1000),
      });
    }
    const old = t.stripeSub({ startDaysAgo: 10, paidCents: 30_000 });
    const fresh = t.stripeSub({ startDaysAgo: 0, paidCents: 30_000 });
    t.row(old.id);
    const r = await t.svc.resolve(t.userId, {
      trigger: 'webhook',
      include: [fresh.id],
    });
    expect(r.outcome).toBe('blocked');
    expect(t.cancelSpy).not.toHaveBeenCalled();
    expect(t.fix(old.id)).toMatchObject({
      status: 'blocked',
      reason: 'nth_duplicate',
    });
    expect(t.review.open).toHaveBeenCalled();
    expect(t.ops.noteBillingDuplicate).toHaveBeenCalledWith('blocked');
  });

  it('switch off: nothing is cancelled, a person is asked', async () => {
    const t = setup({
      settings: { 'billing.duplicate_subscription_autofix': false },
    });
    const old = t.stripeSub({ startDaysAgo: 10, paidCents: 30_000 });
    const fresh = t.stripeSub({ startDaysAgo: 0, paidCents: 30_000 });
    t.row(old.id);
    const r = await t.svc.resolve(t.userId, {
      trigger: 'webhook',
      include: [fresh.id],
    });
    expect(r).toMatchObject({ outcome: 'off', keeperId: old.id });
    expect(t.cancelSpy).not.toHaveBeenCalled();
    expect(t.fix(old.id)).toMatchObject({
      status: 'review',
      reason: 'switch_off',
    });
  });

  it('the kept subscription ended meanwhile: nothing is cancelled', async () => {
    const t = setup();
    const old = t.stripeSub({ startDaysAgo: 10, paidCents: 30_000 });
    const fresh = t.stripeSub({ startDaysAgo: 0, paidCents: 30_000 });
    t.row(old.id);
    const real = t.fake.retrieveSubscription.bind(t.fake);
    jest
      .spyOn(t.fake, 'retrieveSubscription')
      .mockImplementation(async (id) => {
        const s = await real(id);
        // The keeper re-read right before the cancel says it is gone.
        if (id === fresh.id && s) return { ...s, status: 'canceled' };
        return s;
      });
    const r = await t.svc.resolve(t.userId, {
      trigger: 'webhook',
      include: [fresh.id],
    });
    expect(r.outcome).toBe('held');
    expect(t.cancelSpy).not.toHaveBeenCalled();
    expect(t.fake.subscriptions.get(old.id)!.status).toBe('active');
  });

  it('registers itself as the sync service’s duplicate hook', () => {
    const t = setup();
    t.svc.onModuleInit();
    expect(t.sync.setForeignSubscriptionHook).toHaveBeenCalled();
  });
});
