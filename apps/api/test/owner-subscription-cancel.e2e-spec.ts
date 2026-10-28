import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PAYMENT_PROVIDER } from '../src/modules/billing/billing.constants';
import type { FakePaymentProvider } from '../src/modules/billing/fake-payment.provider';
import { PrismaService } from '../src/prisma/prisma.service';
import { adminSession } from './support/admin-login';

/**
 * Owner 2026-10-04: support cancels an attorney's subscription on request —
 * at period end or now, optional prorated refund, undo, audit + notice.
 * Stripe is the fake provider here.
 */
jest.setTimeout(120_000);

describe('Admin cancels a subscription (e2e, fake provider)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fake: FakePaymentProvider;
  let base = '';
  const REASON = 'Attorney asked support to cancel (ticket 17)';

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

  /** An attorney with an active monthly subscription and one paid invoice. */
  async function subscribed() {
    const u = await prisma.user.create({
      data: { role: 'attorney', status: 'active', first_name: 'Sub' },
    });
    const remote = await fake.createSubscription({
      customerId: `cus_${randomUUID().slice(0, 8)}`,
      priceId: 'price_fake',
      paymentMethodId: 'pm_fake',
      trialDays: null,
      metadata: { userId: u.id },
    });
    const row = await prisma.subscription.create({
      data: {
        user_id: u.id,
        stripe_subscription_id: remote.id,
        status: 'active',
        price_cents: 39_900,
        current_period_start: new Date(remote.currentPeriodStart! * 1000),
        current_period_end: new Date(remote.currentPeriodEnd! * 1000),
      },
    });
    const payment = await prisma.payment.create({
      data: {
        user_id: u.id,
        stripe_payment_intent_id: `pi_${randomUUID().slice(0, 8)}`,
        // A subscription payment always has its invoice (SubscriptionSync
        // upserts it by stripe_invoice_id); MONEY H-4 / M-7 key on it.
        stripe_invoice_id: `in_${randomUUID().slice(0, 8)}`,
        amount_cents: 39_900,
        status: 'succeeded',
        paid_at: new Date(),
      },
    });
    return { userId: u.id, row, payment };
  }

  const notices = (userId: string) =>
    prisma.notification.count({
      where: { user_id: userId, type: 'subscription_status' },
    });

  it('cancels at period end, resumes, then cancels now with a prorated refund', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    const { userId, row, payment } = await subscribed();

    const end = await api()
      .post(`/api/v1/admin/subscriptions/${userId}/cancel`)
      .set(admin.auth)
      .send({ when: 'period_end', reason: REASON })
      .expect(200);
    expect(end.body.data).toMatchObject({
      cancelAtPeriodEnd: true,
      refund: null,
    });
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { id: row.id } }))
        .cancel_at_period_end,
    ).toBe(true);
    expect(await notices(userId)).toBe(1);
    // Twice is a conflict; a refund with a period-end cancel is refused.
    await api()
      .post(`/api/v1/admin/subscriptions/${userId}/cancel`)
      .set(admin.auth)
      .send({ when: 'period_end', reason: REASON })
      .expect(409);
    await api()
      .post(`/api/v1/admin/subscriptions/${userId}/cancel`)
      .set(admin.auth)
      .send({ when: 'period_end', refund: 'full', reason: REASON })
      .expect(400);

    await api()
      .post(`/api/v1/admin/subscriptions/${userId}/resume`)
      .set(admin.auth)
      .send({ reason: 'The attorney changed their mind' })
      .expect(200)
      .expect((r) => expect(r.body.data.cancelAtPeriodEnd).toBe(false));

    const now = await api()
      .post(`/api/v1/admin/subscriptions/${userId}/cancel`)
      .set(admin.auth)
      .send({ when: 'now', refund: 'prorated', reason: REASON })
      .expect(200);
    expect(now.body.data.status).toBe('canceled');
    expect(now.body.data.refund.status).toBe('succeeded');
    // Cancelled right after paying: almost all of it comes back.
    expect(now.body.data.refund.amountCents).toBeGreaterThan(39_000);
    expect(now.body.data.refund.amountCents).toBeLessThanOrEqual(39_900);
    expect(
      await prisma.refund.count({ where: { payment_id: payment.id } }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { admin_id: admin.userId, action: 'subscription.cancel' },
      }),
    ).toBe(2);
    expect(await notices(userId)).toBe(3);

    // Nothing live is left to cancel.
    await api()
      .post(`/api/v1/admin/subscriptions/${userId}/cancel`)
      .set(admin.auth)
      .send({ when: 'now', reason: REASON })
      .expect(404);
  });

  it('money stays with the super admin; the reason is required', async () => {
    const { userId } = await subscribed();
    const support = await adminSession(base, prisma, 'support');
    await api()
      .post(`/api/v1/admin/subscriptions/${userId}/cancel`)
      .set(support.auth)
      .send({ when: 'now', reason: REASON })
      .expect(404);
    const admin = await adminSession(base, prisma, 'super_admin');
    await api()
      .post(`/api/v1/admin/subscriptions/${userId}/cancel`)
      .set(admin.auth)
      .send({ when: 'now', reason: 'x'.repeat(501) })
      .expect(400);
  });
});
