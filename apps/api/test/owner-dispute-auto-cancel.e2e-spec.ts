import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PAYMENT_PROVIDER } from '../src/modules/billing/billing.constants';
import type { FakePaymentProvider } from '../src/modules/billing/fake-payment.provider';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * R-237 (owner 2026-11-03): a bank dispute on a subscription charge cancels
 * the subscription at Stripe at once, writes an audit row, issues NO refund,
 * and a webhook retry changes nothing. Closed events (lost / won) are only
 * recorded. Stripe is the fake provider; events go through the real webhook
 * endpoint (Stripe-Signature `fake`, as in the other billing e2e suites).
 */
jest.setTimeout(120_000);

const DAY = 86_400;

describe('Dispute on a subscription charge cancels it (e2e, fake provider)', () => {
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

  const now = () => Math.floor(Date.now() / 1000);

  async function webhook(type: string, object: Record<string, unknown>) {
    const id = `evt_dsp_${++seq}_${randomUUID().slice(0, 6)}`;
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

  /** An attorney with a live paid subscription (invoice booked as Payment). */
  async function paidAttorney() {
    const u = await prisma.user.create({
      data: { role: 'attorney', status: 'active', first_name: 'Dsp' },
    });
    const customerId = `cus_dsp_${randomUUID().slice(0, 8)}`;
    await prisma.stripeCustomer.create({
      data: { user_id: u.id, stripe_customer_id: customerId },
    });
    const subId = `sub_dsp_${randomUUID().slice(0, 10)}`;
    const invoiceId = `in_dsp_${randomUUID().slice(0, 10)}`;
    const intentId = `pi_dsp_${randomUUID().slice(0, 10)}`;
    const start = now() - 5 * DAY;
    fake.invoices.set(invoiceId, {
      id: invoiceId,
      customerId,
      subscriptionId: subId,
      amountCents: 30_000,
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
        price_cents: 30_000,
        current_period_start: new Date(start * 1000),
        current_period_end: new Date((start + 30 * DAY) * 1000),
      },
    });
    await webhook('invoice.paid', { object: 'invoice', id: invoiceId });
    return { userId: u.id, subId, invoiceId, intentId };
  }

  const dispute = (intentId: string, id: string, status: string) => ({
    object: 'dispute',
    id,
    status,
    reason: 'fraudulent',
    amount: 30_000,
    currency: 'usd',
    payment_intent: intentId,
    charge: `ch_${id}`,
  });

  const audits = (userId: string, prefix: string) =>
    prisma.auditLog.findMany({
      where: { admin_id: userId, action: { startsWith: prefix } },
    });

  it('created: cancelled now, audited, no refund; a retry changes nothing', async () => {
    const a = await paidAttorney();
    const dpId = `dp_${randomUUID().slice(0, 8)}`;
    await webhook(
      'charge.dispute.created',
      dispute(a.intentId, dpId, 'needs_response'),
    );
    expect(fake.subscriptions.get(a.subId)!.status).toBe('canceled');
    const row = await prisma.subscription.findUniqueOrThrow({
      where: { user_id: a.userId },
    });
    expect(row.status).toBe('canceled');
    const done = await audits(a.userId, 'system.billing.dispute.');
    expect(done.map((x) => x.action)).toEqual([
      'system.billing.dispute.subscription_canceled',
    ]);
    const pay = await prisma.payment.findUniqueOrThrow({
      where: { stripe_invoice_id: a.invoiceId },
    });
    expect(await prisma.refund.count({ where: { payment_id: pay.id } })).toBe(
      0,
    );
    // The admin review queue still gets the dispute (existing behaviour).
    expect(
      await prisma.stripeReviewItem.count({
        where: { kind: 'dispute', stripe_ref: dpId },
      }),
    ).toBe(1);

    // Stripe re-sends the same dispute (new event id): no second cancel.
    await webhook(
      'charge.dispute.created',
      dispute(a.intentId, dpId, 'needs_response'),
    );
    const again = await audits(a.userId, 'system.billing.dispute.');
    expect(again.map((x) => x.action).sort()).toEqual([
      'system.billing.dispute.already_canceled',
      'system.billing.dispute.subscription_canceled',
    ]);
  });

  it('closed lost / won: only recorded, nothing reinstated or refunded', async () => {
    const a = await paidAttorney();
    const dpId = `dp_${randomUUID().slice(0, 8)}`;
    await webhook(
      'charge.dispute.created',
      dispute(a.intentId, dpId, 'needs_response'),
    );
    await webhook('charge.dispute.closed', dispute(a.intentId, dpId, 'won'));
    expect(fake.subscriptions.get(a.subId)!.status).toBe('canceled');
    expect(
      (
        await prisma.subscription.findUniqueOrThrow({
          where: { user_id: a.userId },
        })
      ).status,
    ).toBe('canceled');
    const actions = (await audits(a.userId, 'system.billing.dispute.')).map(
      (x) => x.action,
    );
    expect(actions).toContain('system.billing.dispute.closed_won');

    const b = await paidAttorney();
    const dp2 = `dp_${randomUUID().slice(0, 8)}`;
    await webhook(
      'charge.dispute.created',
      dispute(b.intentId, dp2, 'needs_response'),
    );
    await webhook('charge.dispute.closed', dispute(b.intentId, dp2, 'lost'));
    expect(
      (await audits(b.userId, 'system.billing.dispute.')).map((x) => x.action),
    ).toContain('system.billing.dispute.closed_lost');
    const pay = await prisma.payment.findUniqueOrThrow({
      where: { stripe_invoice_id: b.invoiceId },
    });
    expect(await prisma.refund.count({ where: { payment_id: pay.id } })).toBe(
      0,
    );
  });

  it('a dispute on a charge that is not a subscription invoice changes nothing', async () => {
    const a = await paidAttorney();
    await webhook(
      'charge.dispute.created',
      dispute(
        `pi_other_${randomUUID().slice(0, 8)}`,
        'dp_other',
        'needs_response',
      ),
    );
    expect(fake.subscriptions.get(a.subId)!.status).toBe('active');
    expect(await audits(a.userId, 'system.billing.dispute.')).toHaveLength(0);
  });
});
