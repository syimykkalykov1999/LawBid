import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { totpCode } from '../src/modules/admin-auth/totp.util';
import { PAYMENT_PROVIDER } from '../src/modules/billing/billing.constants';
import type { FakePaymentProvider } from '../src/modules/billing/fake-payment.provider';
import { FLAG_CATALOG } from '../src/modules/feature-flags/flag-catalog';
import { FeatureFlagsService } from '../src/modules/feature-flags/services/feature-flags.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { adminSession } from './support/admin-login';

/**
 * R-237 (owner 2026-11-05): the automatic refund of a bank inquiry on a
 * subscription charge. Real money: off by default, a chargeback is never
 * refunded, a repeated webhook never pays twice, above the limits a person
 * decides. Stripe is the fake provider; nothing reaches the real one.
 */
jest.setTimeout(120_000);

const DAY = 86_400;
const FLAG = 'dispute_auto_refund';

describe('Automatic refund of a bank inquiry (e2e, fake provider)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let flags: FeatureFlagsService;
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
    flags = app.get(FeatureFlagsService);
    fake = app.get<FakePaymentProvider>(PAYMENT_PROVIDER);
    expect(fake.name).toBe('fake');
  });

  afterAll(async () => {
    await setFlag(false);
    await app.close();
  });

  async function setFlag(enabled: boolean) {
    await prisma.featureFlag.upsert({
      where: { key: FLAG },
      update: { enabled },
      create: {
        key: FLAG,
        enabled,
        description: 'test',
        rollout_percent: 100,
      },
    });
    await flags.invalidate();
  }

  const now = () => Math.floor(Date.now() / 1000);

  async function webhook(type: string, object: Record<string, unknown>) {
    const id = `evt_rfd_${++seq}_${randomUUID().slice(0, 6)}`;
    await request(base)
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

  async function paidAttorney(amountCents = 30_000) {
    const u = await prisma.user.create({
      data: { role: 'attorney', status: 'active', first_name: 'Rfd' },
    });
    const customerId = `cus_rfd_${randomUUID().slice(0, 8)}`;
    await prisma.stripeCustomer.create({
      data: { user_id: u.id, stripe_customer_id: customerId },
    });
    const subId = `sub_rfd_${randomUUID().slice(0, 10)}`;
    const invoiceId = `in_rfd_${randomUUID().slice(0, 10)}`;
    const intentId = `pi_rfd_${randomUUID().slice(0, 10)}`;
    const start = now() - 5 * DAY;
    fake.invoices.set(invoiceId, {
      id: invoiceId,
      customerId,
      subscriptionId: subId,
      amountCents,
      currency: 'usd',
      status: 'paid',
      paidAt: start,
      paymentIntentId: intentId,
      failureCode: null,
      _version: 100,
    });
    fake.subscriptions.set(subId, {
      id: subId,
      customerId,
      status: 'active',
      trialStart: null,
      trialEnd: null,
      currentPeriodStart: start,
      currentPeriodEnd: start + 30 * DAY,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      defaultPaymentMethodId: 'pm_fake',
      metadata: { userId: u.id },
      latestInvoiceId: invoiceId,
      created: start,
      _version: 100,
    });
    await prisma.subscription.create({
      data: {
        user_id: u.id,
        stripe_subscription_id: subId,
        status: 'active',
        price_cents: amountCents,
        current_period_start: new Date(start * 1000),
        current_period_end: new Date((start + 30 * DAY) * 1000),
      },
    });
    await webhook('invoice.paid', { object: 'invoice', id: invoiceId });
    return { userId: u.id, subId, invoiceId, intentId };
  }

  const dispute = (
    intentId: string,
    id: string,
    status: string,
    refundable = true,
  ) => ({
    object: 'dispute',
    id,
    status,
    reason: 'general',
    amount: 30_000,
    currency: 'usd',
    payment_intent: intentId,
    charge: `ch_${id}`,
    is_charge_refundable: refundable,
    evidence_details: { due_by: now() + 10 * DAY },
  });

  const newDisputeId = () => `dp_${randomUUID().slice(0, 8)}`;
  const moneyOut = (intentId: string) =>
    [...fake.refunds.values()].filter((r) => r.paymentIntentId === intentId);
  const row = (disputeId: string) =>
    prisma.billingDisputeRefund.findUnique({
      where: { dispute_id: disputeId },
    });

  it('the switch is off by default: nothing is refunded', async () => {
    expect(FLAG_CATALOG.find((f) => f.key === FLAG)?.enabled).toBe(false);
    const a = await paidAttorney();
    const dp = newDisputeId();
    await webhook(
      'charge.dispute.created',
      dispute(a.intentId, dp, 'warning_needs_response'),
    );
    expect(moneyOut(a.intentId)).toHaveLength(0);
    expect(await row(dp)).toBeNull();
    expect(fake.subscriptions.get(a.subId)?.status).toBe('active');
  });

  describe('switched on', () => {
    beforeAll(() => setFlag(true));
    afterAll(() => setFlag(false));

    it('an inquiry: cancelled, refunded in full once, audited, user told', async () => {
      const a = await paidAttorney();
      const dp = newDisputeId();
      const event = dispute(a.intentId, dp, 'warning_needs_response');

      await webhook('charge.dispute.created', event);
      // Stripe redelivers, and the same dispute reports an update.
      await webhook('charge.dispute.created', event);
      await webhook('charge.dispute.updated', event);

      const out = moneyOut(a.intentId);
      expect(out).toHaveLength(1);
      expect(out[0]?.amountCents).toBe(30_000);
      expect(await row(dp)).toMatchObject({
        status: 'refunded',
        amount_cents: 30_000,
        user_id: a.userId,
      });
      expect(fake.subscriptions.get(a.subId)?.status).toBe('canceled');
      const refunds = await prisma.refund.findMany({
        where: { user_id: a.userId },
      });
      expect(refunds).toHaveLength(1);
      expect(refunds[0]?.reason).toBe(`dispute_auto:${dp}`);
      expect(
        await prisma.auditLog.count({
          where: {
            admin_id: a.userId,
            action: 'system.billing.dispute_refund.refunded',
          },
        }),
      ).toBe(1);
      const notices = await prisma.notification.findMany({
        where: { user_id: a.userId, type: 'subscription_status' },
      });
      expect(
        notices.filter(
          (n) => (n.payload as { kind?: string }).kind === 'dispute_refund',
        ),
      ).toHaveLength(1);
    });

    it('a chargeback is never refunded: the bank already took the money', async () => {
      const a = await paidAttorney();
      const dp = newDisputeId();
      await webhook(
        'charge.dispute.created',
        dispute(a.intentId, dp, 'needs_response'),
      );
      expect(moneyOut(a.intentId)).toHaveLength(0);
      expect(await row(dp)).toBeNull();
      expect(fake.subscriptions.get(a.subId)?.status).toBe('canceled');
    });

    it('Stripe says not refundable, or evidence was sent: no refund', async () => {
      const a = await paidAttorney();
      const first = newDisputeId();
      await webhook(
        'charge.dispute.created',
        dispute(a.intentId, first, 'warning_needs_response', false),
      );
      const second = newDisputeId();
      await webhook(
        'charge.dispute.created',
        dispute(a.intentId, second, 'warning_under_review'),
      );
      expect(moneyOut(a.intentId)).toHaveLength(0);
      expect(await row(first)).toBeNull();
      expect(await row(second)).toBeNull();
    });

    it('above the amount limit: held, a person approves with a 2FA code', async () => {
      const a = await paidAttorney(60_000);
      const dp = newDisputeId();
      const event = dispute(a.intentId, dp, 'warning_needs_response');
      await webhook('charge.dispute.created', event);

      expect(moneyOut(a.intentId)).toHaveLength(0);
      const held = await row(dp);
      expect(held).toMatchObject({ status: 'review', reason: 'over_amount' });
      expect(fake.subscriptions.get(a.subId)?.status).toBe('active');
      const item = await prisma.stripeReviewItem.findUnique({
        where: {
          kind_stripe_ref: { kind: 'dispute_refund', stripe_ref: dp },
        },
      });
      expect(item?.status).toBe('open');

      const admin = await adminSession(base, prisma, 'super_admin');
      const path = `/api/v1/admin/billing/dispute-refunds/${held!.id}/approve`;
      const refused = await request(base).post(path).set(admin.auth);
      expect(refused.status).toBe(403);
      expect(moneyOut(a.intentId)).toHaveLength(0);

      await request(base)
        .post('/api/v1/admin/auth/step-up')
        .set(admin.auth)
        .send({ code: totpCode(admin.totpSecret, Date.now() + 30_000) })
        .expect(200);
      fake.disputes.set(dp, {
        id: dp,
        chargeId: null,
        paymentIntentId: a.intentId,
        status: 'warning_needs_response',
        reason: 'general',
        amountCents: 60_000,
        currency: 'usd',
        dueBy: null,
        hasEvidence: false,
        pastDue: false,
        submissionCount: 0,
        chargeRefundable: true,
        accountId: null,
        evidence: {},
      });
      const ok = await request(base).post(path).set(admin.auth).expect(200);
      expect((ok.body as { data: { status: string } }).data.status).toBe(
        'refunded',
      );
      expect(moneyOut(a.intentId)).toHaveLength(1);
      expect(fake.subscriptions.get(a.subId)?.status).toBe('canceled');
      expect(
        await prisma.auditLog.count({
          where: {
            admin_id: admin.userId,
            action: 'billing.dispute_refund.approve',
            target_id: held!.id,
          },
        }),
      ).toBe(1);
      // Approving twice cannot pay twice.
      await request(base).post(path).set(admin.auth).expect(409);
      expect(moneyOut(a.intentId)).toHaveLength(1);
      const closed = await prisma.stripeReviewItem.findUnique({
        where: {
          kind_stripe_ref: { kind: 'dispute_refund', stripe_ref: dp },
        },
      });
      expect(closed?.status).toBe('resolved');
    });

    it('a held inquiry that grew into a chargeback is not refunded', async () => {
      const a = await paidAttorney(60_000);
      const dp = newDisputeId();
      await webhook(
        'charge.dispute.created',
        dispute(a.intentId, dp, 'warning_needs_response'),
      );
      await webhook(
        'charge.dispute.updated',
        dispute(a.intentId, dp, 'needs_response'),
      );
      expect(await row(dp)).toMatchObject({
        status: 'no_refund',
        reason: 'escalated',
      });
      expect(moneyOut(a.intentId)).toHaveLength(0);
    });

    it('a second inquiry of the same user waits for a person', async () => {
      const a = await paidAttorney();
      await webhook(
        'charge.dispute.created',
        dispute(a.intentId, newDisputeId(), 'warning_needs_response'),
      );
      const b = await paidAttorney();
      // The same person's other payment.
      await prisma.payment.updateMany({
        where: { stripe_payment_intent_id: b.intentId },
        data: { user_id: a.userId },
      });
      const dp = newDisputeId();
      await webhook(
        'charge.dispute.created',
        dispute(b.intentId, dp, 'warning_needs_response'),
      );
      const held = await row(dp);
      expect(held?.status).toBe('review');
      // Stopped by the earlier dispute, whichever limit speaks first.
      expect(['prior_dispute', 'user_limit']).toContain(held?.reason);
      expect(moneyOut(b.intentId)).toHaveLength(0);
    });

    it('a person may refuse: no money, the reason is kept', async () => {
      const a = await paidAttorney(60_000);
      const dp = newDisputeId();
      await webhook(
        'charge.dispute.created',
        dispute(a.intentId, dp, 'warning_needs_response'),
      );
      const held = await row(dp);
      const admin = await adminSession(base, prisma, 'super_admin');
      await request(base)
        .post('/api/v1/admin/auth/step-up')
        .set(admin.auth)
        .send({ code: totpCode(admin.totpSecret, Date.now() + 30_000) })
        .expect(200);
      await request(base)
        .post(`/api/v1/admin/billing/dispute-refunds/${held!.id}/reject`)
        .set(admin.auth)
        .send({ note: 'Answering the bank instead' })
        .expect(200);
      expect(await row(dp)).toMatchObject({
        status: 'rejected',
        note: 'Answering the bank instead',
      });
      expect(moneyOut(a.intentId)).toHaveLength(0);

      const list = await request(base)
        .get('/api/v1/admin/billing/dispute-refunds')
        .set(admin.auth)
        .expect(200);
      expect(
        (list.body as { data: { disputeId: string }[] }).data.map(
          (r) => r.disputeId,
        ),
      ).toContain(dp);
    });
  });
});
