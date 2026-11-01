import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PAYMENT_PROVIDER } from '../src/modules/billing/billing.constants';
import { DuplicateSubscriptionsService } from '../src/modules/billing/duplicate-subscriptions.service';
import { SubscriptionsService } from '../src/modules/billing/subscriptions.service';
import type { FakePaymentProvider } from '../src/modules/billing/fake-payment.provider';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { adminSession } from './support/admin-login';

/**
 * Algo audit M-4 (owner 2026-10-28): an attorney with two live Stripe
 * subscriptions (a second device; a re-subscription after grace) — the
 * newest paid one stays, the other is cancelled first and only its unused
 * remainder refunded (ledger + audit), webhook retries change nothing, a
 * disputed charge is held for a person. Stripe is the fake provider; the
 * events go through the real webhook endpoint and queue.
 */
jest.setTimeout(120_000);

const DAY = 86_400;

describe('Duplicate subscriptions are resolved automatically (e2e, fake provider)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fake: FakePaymentProvider;
  let base = '';
  let seq = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    fake = app.get<FakePaymentProvider>(PAYMENT_PROVIDER);
    expect(fake.name).toBe('fake');
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);
  const now = () => Math.floor(Date.now() / 1000);

  async function webhook(type: string, object: Record<string, unknown>) {
    const id = `evt_dup_${++seq}_${randomUUID().slice(0, 6)}`;
    await api()
      .post('/api/v1/webhooks/stripe')
      .set('Stripe-Signature', 'fake')
      .set('Content-Type', 'application/json')
      .send({ id, type, created: now(), data: { object } })
      .expect((r) => expect(r.status).toBeLessThan(300));
    for (let i = 0; i < 150; i++) {
      const row = await prisma.stripeWebhookEvent.findUnique({
        where: { stripe_event_id: id },
      });
      if (row?.processed_at) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`event ${id} not processed in time`);
  }

  /** An attorney with a Stripe customer. */
  async function attorney() {
    const u = await prisma.user.create({
      data: { role: 'attorney', status: 'active', first_name: 'Dup' },
    });
    const customerId = `cus_dup_${randomUUID().slice(0, 8)}`;
    await prisma.stripeCustomer.create({
      data: { user_id: u.id, stripe_customer_id: customerId },
    });
    return { userId: u.id, customerId };
  }

  /** A live subscription at the fake Stripe whose last invoice is paid. */
  function stripeSub(
    customerId: string,
    userId: string,
    opts: {
      startDaysAgo: number;
      cents: number;
      status?: 'active' | 'past_due';
    },
  ) {
    const id = `sub_dup_${randomUUID().slice(0, 10)}`;
    const invoiceId = `in_dup_${randomUUID().slice(0, 10)}`;
    const intentId = `pi_dup_${randomUUID().slice(0, 10)}`;
    const start = now() - opts.startDaysAgo * DAY;
    // _version 100: a webhook body never overwrites what the "Stripe" knows.
    fake.invoices.set(invoiceId, {
      id: invoiceId,
      customerId,
      subscriptionId: id,
      amountCents: opts.cents,
      currency: 'usd',
      status: 'paid',
      paidAt: start,
      paymentIntentId: intentId,
      failureCode: null,
      _version: 100,
    });
    fake.subscriptions.set(id, {
      id,
      customerId,
      status: opts.status ?? 'active',
      trialStart: null,
      trialEnd: null,
      currentPeriodStart: start,
      currentPeriodEnd: start + 30 * DAY,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      defaultPaymentMethodId: 'pm_fake',
      metadata: { userId },
      latestInvoiceId: invoiceId,
      created: start,
      _version: 100,
    });
    return { id, invoiceId, intentId, start };
  }

  async function liveRow(userId: string, sub: { id: string; start: number }) {
    await prisma.subscription.create({
      data: {
        user_id: userId,
        stripe_subscription_id: sub.id,
        status: 'active',
        price_cents: 30_000,
        current_period_start: new Date(sub.start * 1000),
        current_period_end: new Date((sub.start + 30 * DAY) * 1000),
      },
    });
  }

  const paid = (invoiceId: string) =>
    webhook('invoice.paid', { object: 'invoice', id: invoiceId });

  it('second device: keeps the newest paid, cancels the old, refunds its unused part once', async () => {
    const { userId, customerId } = await attorney();
    const old = stripeSub(customerId, userId, {
      startDaysAgo: 10,
      cents: 30_000,
    });
    await liveRow(userId, old);
    await paid(old.invoiceId);
    const fresh = stripeSub(customerId, userId, {
      startDaysAgo: 0,
      cents: 30_000,
    });
    // The duplicate's paid invoice reaches us: booked, then resolved.
    await paid(fresh.invoiceId);

    expect(fake.subscriptions.get(old.id)!.status).toBe('canceled');
    expect(fake.subscriptions.get(fresh.id)!.status).toBe('active');
    const fix = await prisma.billingDuplicateFix.findUniqueOrThrow({
      where: { duplicate_subscription_id: old.id },
    });
    expect(fix).toMatchObject({
      user_id: userId,
      kept_subscription_id: fresh.id,
      status: 'refunded',
      charged_cents: 30_000,
    });
    // ~20 of 30 days were unused; never above the charge.
    expect(fix.refund_cents).toBeGreaterThan(19_900);
    expect(fix.refund_cents).toBeLessThanOrEqual(20_000);

    // Access follows the kept subscription.
    const row = await prisma.subscription.findUniqueOrThrow({
      where: { user_id: userId },
    });
    expect(row.stripe_subscription_id).toBe(fresh.id);
    expect(row.status).toBe('active');

    // The refund is on the OLD payment only, booked in the ledger.
    const oldPayment = await prisma.payment.findUniqueOrThrow({
      where: { stripe_invoice_id: old.invoiceId },
    });
    const freshPayment = await prisma.payment.findUniqueOrThrow({
      where: { stripe_invoice_id: fresh.invoiceId },
    });
    const refunds = await prisma.refund.findMany({
      where: { payment_id: { in: [oldPayment.id, freshPayment.id] } },
    });
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({
      payment_id: oldPayment.id,
      amount_cents: fix.refund_cents,
      status: 'succeeded',
      admin_id: null,
    });
    expect(
      await prisma.ledgerEntry.count({
        where: {
          source_type: 'payment_refund',
          source_id: `${oldPayment.id}:${refunds[0].id}`,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          target_id: fix.id,
          action: {
            in: [
              'system.billing.duplicate_subscription.canceled',
              'system.billing.duplicate_subscription.refunded',
            ],
          },
        },
      }),
    ).toBe(2);
    const sentToStripe = [...fake.refunds.values()].filter(
      (r) => r.paymentIntentId === old.intentId,
    );
    expect(sentToStripe).toHaveLength(1);

    // Retries and out-of-order events change nothing.
    await paid(fresh.invoiceId);
    await webhook('customer.subscription.deleted', {
      object: 'subscription',
      id: old.id,
    });
    await paid(old.invoiceId);
    expect(
      await prisma.refund.count({ where: { payment_id: oldPayment.id } }),
    ).toBe(1);
    expect(
      [...fake.refunds.values()].filter(
        (r) => r.paymentIntentId === old.intentId,
      ),
    ).toHaveLength(1);
    expect(
      (
        await prisma.subscription.findUniqueOrThrow({
          where: { user_id: userId },
        })
      ).stripe_subscription_id,
    ).toBe(fresh.id);

    // The billing page lists it.
    const admin = await adminSession(base, prisma, 'super_admin');
    const list = await api()
      .get('/api/v1/admin/billing/duplicate-subscriptions')
      .query({ userId })
      .set(admin.auth)
      .expect(200);
    expect(list.body.data).toEqual([
      expect.objectContaining({
        duplicateSubscriptionId: old.id,
        keptSubscriptionId: fresh.id,
        status: 'refunded',
        refundCents: fix.refund_cents,
      }),
    ]);
  });

  it('a disputed charge: cancelled, not refunded, held for a person', async () => {
    const { userId, customerId } = await attorney();
    const old = stripeSub(customerId, userId, {
      startDaysAgo: 10,
      cents: 30_000,
    });
    await liveRow(userId, old);
    await paid(old.invoiceId);
    fake.disputedIntents.add(old.intentId);
    const fresh = stripeSub(customerId, userId, {
      startDaysAgo: 0,
      cents: 30_000,
    });
    await paid(fresh.invoiceId);

    expect(fake.subscriptions.get(old.id)!.status).toBe('canceled');
    expect(
      await prisma.billingDuplicateFix.findUniqueOrThrow({
        where: { duplicate_subscription_id: old.id },
      }),
    ).toMatchObject({ status: 'review', reason: 'dispute' });
    const oldPayment = await prisma.payment.findUniqueOrThrow({
      where: { stripe_invoice_id: old.invoiceId },
    });
    expect(
      await prisma.refund.count({ where: { payment_id: oldPayment.id } }),
    ).toBe(0);
    expect(
      await prisma.stripeReviewItem.findUnique({
        where: {
          kind_stripe_ref: {
            kind: 'duplicate_subscription',
            stripe_ref: old.id,
          },
        },
      }),
    ).toMatchObject({ status: 'open', user_id: userId });
  });

  it('a second device pays on the hosted page: the paid one stays, the newcomer is cancelled, access follows', async () => {
    const tokens = app.get(TokenService);
    const username = `dup_${randomUUID().slice(0, 8)}`;
    const u = await prisma.user.create({
      data: {
        role: 'attorney',
        email: `${username}@lawbid-e2e.test`,
        attorney_profile: {
          create: {
            username,
            username_lower: username,
            languages: ['en'],
            verification_status: 'verified',
          },
        },
      },
    });
    const auth = {
      Authorization: `Bearer ${tokens.signAccessToken({ sub: u.id, role: 'attorney', sid: randomUUID(), verified: true, subscriptionStatus: 'none' })}`,
    };
    // Both devices open the card sheet before either pays.
    const intents: string[] = [];
    for (let i = 0; i < 2; i++) {
      const start = await api()
        .post('/api/v1/subscriptions/start')
        .set(auth)
        .expect(200);
      const id = (start.body as { data: { setupIntentId: string } }).data
        .setupIntentId;
      fake.confirmSetupIntent(id, {
        paymentMethodId: `pm_${randomUUID().slice(0, 8)}`,
        fingerprint: `fp_${randomUUID().slice(0, 8)}`,
      });
      intents.push(id);
    }
    await api()
      .post('/api/v1/subscriptions/confirm')
      .set(auth)
      .send({ setupIntentId: intents[0], chargeNow: true })
      .expect((r) => expect(r.status).toBeLessThan(300));
    const first = await prisma.subscription.findUniqueOrThrow({
      where: { user_id: u.id },
    });
    const firstId = first.stripe_subscription_id!;
    // Its first invoice is paid (the fake's checkout has no invoice).
    const customerId = fake.subscriptions.get(firstId)!.customerId;
    const invoiceId = `in_dup_${randomUUID().slice(0, 10)}`;
    fake.invoices.set(invoiceId, {
      id: invoiceId,
      customerId,
      subscriptionId: firstId,
      amountCents: 39_900,
      currency: 'usd',
      status: 'paid',
      paidAt: now(),
      paymentIntentId: `pi_dup_${randomUUID().slice(0, 10)}`,
      failureCode: null,
      _version: 100,
    });
    fake.subscriptions.set(firstId, {
      ...fake.subscriptions.get(firstId)!,
      latestInvoiceId: invoiceId,
      _version: 100,
    });
    await paid(invoiceId);

    // The second device had Stripe's hosted page open and pays there too
    // (the in-app sheet refuses a second one: 409 already active).
    await api()
      .post('/api/v1/subscriptions/confirm')
      .set(auth)
      .send({ setupIntentId: intents[1], chargeNow: true })
      .expect(409);
    const session = await fake.createCheckoutSession({
      customerId,
      lineItems: [{ priceId: 'price_fake_399', quantity: 1 }],
      trialDays: null,
      successUrl: 'https://lawbid.app/ok',
      cancelUrl: 'https://lawbid.app/no',
      metadata: { userId: u.id, plan: 'monthly' },
    });
    await fake.payCheckout(session.id);
    await app.get(SubscriptionsService).applyCheckout(session.id, u.id);
    const live = [...fake.subscriptions.values()].filter(
      (x) => x.customerId === customerId && x.status !== 'canceled',
    );
    expect(live.map((x) => x.id)).toEqual([firstId]);
    const row = await prisma.subscription.findUniqueOrThrow({
      where: { user_id: u.id },
    });
    expect(row.stripe_subscription_id).toBe(firstId);
    expect(['active', 'trialing']).toContain(row.status);
    const fixes = await prisma.billingDuplicateFix.findMany({
      where: { user_id: u.id },
    });
    expect(fixes).toHaveLength(1);
    expect(fixes[0]).toMatchObject({
      kept_subscription_id: firstId,
      trigger: 'app_order',
      status: 'no_refund',
      reason: 'no_charge',
    });
  });

  it('grace re-subscription: the stale old subscription is cancelled without a refund', async () => {
    const { userId, customerId } = await attorney();
    // Paid 40 days ago, then the card failed; the attorney paid anew.
    const stale = stripeSub(customerId, userId, {
      startDaysAgo: 40,
      cents: 30_000,
      status: 'past_due',
    });
    const fresh = stripeSub(customerId, userId, {
      startDaysAgo: 0,
      cents: 30_000,
    });
    await liveRow(userId, fresh);
    const r = await app.get(DuplicateSubscriptionsService).resolve(userId, {
      trigger: 'grace_resubscribe',
      include: [stale.id],
    });
    expect(r).toMatchObject({ keeperId: fresh.id, canceled: [stale.id] });
    expect(fake.subscriptions.get(stale.id)!.status).toBe('canceled');
    expect(fake.subscriptions.get(fresh.id)!.status).toBe('active');
    expect(
      await prisma.billingDuplicateFix.findUniqueOrThrow({
        where: { duplicate_subscription_id: stale.id },
      }),
    ).toMatchObject({
      status: 'no_refund',
      reason: 'period_over',
      refund_cents: 0,
    });
    expect(
      [...fake.refunds.values()].filter(
        (x) => x.paymentIntentId === stale.intentId,
      ),
    ).toHaveLength(0);
  });
});
