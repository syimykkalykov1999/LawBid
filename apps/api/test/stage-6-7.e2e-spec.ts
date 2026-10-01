import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { PAYMENT_PROVIDER } from '../src/modules/billing/billing.constants';
import { BillingRunner } from '../src/modules/billing/billing.runner';
import type { FakePaymentProvider } from '../src/modules/billing/fake-payment.provider';
import { SubscriptionAccessService } from '../src/modules/subscriptions/subscription-access.service';
import { adminSession } from './support/admin-login';

jest.setTimeout(180_000);

interface Body {
  data: Record<string, unknown>;
  error?: { code: string; details?: Record<string, unknown> };
}

/**
 * docs/06 stage 6.7 acceptance with the fake provider (Stripe keys are
 * not set in e2e): trial → charge → active; failed payment → past_due →
 * grace → inactive with bids withdrawn; a repeated webhook creates no
 * duplicates; out-of-order webhooks end in the right state; a second
 * trial on the same card is refused.
 */
describe('stage 6.7 — Stripe subscriptions (e2e, fake provider)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let fake: FakePaymentProvider;
  let access: SubscriptionAccessService;
  let runner: BillingRunner;
  let baseUrl = '';
  let practiceAreaId = '';
  const api = () => request(baseUrl);
  let eventSeq = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      rawBody: true,
    });
    configureApp(app as NestExpressApplication);
    await app.init();
    await app.listen(0);
    const port = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port.port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    fake = app.get<FakePaymentProvider>(PAYMENT_PROVIDER);
    access = app.get(SubscriptionAccessService);
    runner = app.get(BillingRunner);
    expect(fake.name).toBe('fake');
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey', is_active: true },
      update: {},
    });
    practiceAreaId = (
      await prisma.practiceArea.upsert({
        where: { code: 'e2e_billing_leaf' },
        create: {
          code: 'e2e_billing_leaf',
          name_en: 'E2E billing',
          i18n_key: 'practice.e2e_billing_leaf',
          sort: 1,
        },
        update: {},
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function attorney(verified = true) {
    const username = `att_${randomUUID().slice(0, 8)}`;
    const u = await prisma.user.create({
      data: {
        role: 'attorney',
        email: `${username}@lawbid-e2e.test`,
        attorney_profile: {
          create: {
            username,
            username_lower: username,
            languages: ['en'],
            verification_status: verified ? 'verified' : 'pending',
          },
        },
      },
    });
    return {
      id: u.id,
      auth: {
        Authorization: `Bearer ${tokens.signAccessToken({ sub: u.id, role: 'attorney', sid: randomUUID(), verified, subscriptionStatus: 'none' })}`,
      },
    };
  }

  async function bidFor(attorneyId: string) {
    const client = await prisma.user.create({ data: { role: 'client' } });
    const c = await prisma.case.create({
      data: {
        client_id: client.id,
        title: 'Billing case',
        description:
          'A case whose bid must be withdrawn when the subscription lapses.',
        practice_area_id: practiceAreaId,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'NJ', is_primary: true },
    });
    return prisma.bid.create({
      data: {
        case_id: c.id,
        attorney_id: attorneyId,
        fee_type: 'fixed',
        amount_cents: 50_000,
        message: 'Hi',
        start_availability: 'immediately',
        turn: 'client',
      },
    });
  }

  /** Start + bind a card + confirm; returns the local row. */
  async function subscribe(
    a: { id: string; auth: Record<string, string> },
    fingerprint: string,
    chargeNow = false,
  ) {
    const start = await api()
      .post('/api/v1/subscriptions/start')
      .set(a.auth)
      .expect(200);
    const { setupIntentId } = (start.body as Body).data as {
      setupIntentId: string;
    };
    fake.confirmSetupIntent(setupIntentId, {
      paymentMethodId: `pm_${randomUUID().slice(0, 8)}`,
      fingerprint,
    });
    const confirm = await api()
      .post('/api/v1/subscriptions/confirm')
      .set(a.auth)
      .send({ setupIntentId, chargeNow });
    return {
      confirm,
      row: await prisma.subscription.findUnique({ where: { user_id: a.id } }),
    };
  }

  async function webhook(
    type: string,
    object: Record<string, unknown>,
    id = `evt_${++eventSeq}_${randomUUID().slice(0, 6)}`,
  ) {
    const res = await api()
      .post('/api/v1/webhooks/stripe')
      .set('Stripe-Signature', 'fake')
      .set('Content-Type', 'application/json')
      .send({
        id,
        type,
        created: Math.floor(Date.now() / 1000),
        data: { object },
      });
    return { id, res };
  }

  async function processed(eventId: string) {
    for (let i = 0; i < 100; i++) {
      const row = await prisma.stripeWebhookEvent.findUnique({
        where: { stripe_event_id: eventId },
      });
      if (row?.processed_at) return row;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`event ${eventId} not processed in time`);
  }

  const subObject = (
    row: { stripe_subscription_id: string | null },
    patch: Record<string, unknown>,
  ) => ({
    object: 'subscription',
    id: row.stripe_subscription_id,
    ...patch,
  });

  it('gates: clients and unverified attorneys cannot start; a verified attorney gets a SetupIntent and trial eligibility', async () => {
    const client = await prisma.user.create({ data: { role: 'client' } });
    const clientAuth = {
      Authorization: `Bearer ${tokens.signAccessToken({ sub: client.id, role: 'client', sid: randomUUID(), verified: false, subscriptionStatus: 'none' })}`,
    };
    await api().post('/api/v1/subscriptions/start').set(clientAuth).expect(403);
    const pending = await attorney(false);
    const denied = await api()
      .post('/api/v1/subscriptions/start')
      .set(pending.auth)
      .expect(403);
    expect((denied.body as Body).error?.code).toBe('ATTORNEY_NOT_VERIFIED');

    const a = await attorney();
    const me0 = await api()
      .get('/api/v1/subscriptions/me')
      .set(a.auth)
      .expect(200);
    expect((me0.body as Body).data).toMatchObject({
      subscription: null,
      isActive: false,
      canStart: true,
      trialEligible: true,
      priceCents: 39_900,
    });
    const start = await api()
      .post('/api/v1/subscriptions/start')
      .set(a.auth)
      .expect(200);
    expect((start.body as Body).data).toMatchObject({
      trialEligible: true,
      priceCents: 39_900,
      trialDays: 7,
    });
    expect(
      ((start.body as Body).data.clientSecret as string).length,
    ).toBeGreaterThan(10);
    // Confirm before the card is bound → 409.
    const early = await api()
      .post('/api/v1/subscriptions/confirm')
      .set(a.auth)
      .send({ setupIntentId: (start.body as Body).data.setupIntentId })
      .expect(409);
    expect((early.body as Body).error?.code).toBe(
      'SUBSCRIPTION_SETUP_INCOMPLETE',
    );
  });

  it('trial → charge → active; duplicate and out-of-order webhooks; payment history', async () => {
    const a = await attorney();
    const { confirm, row } = await subscribe(
      a,
      `fp_${randomUUID().slice(0, 8)}`,
    );
    expect(confirm.status).toBe(200);
    expect((confirm.body as Body).data).toMatchObject({
      isActive: true,
      subscription: expect.objectContaining({ status: 'trialing' }),
    });
    expect(row).toMatchObject({ status: 'trialing', price_cents: 39_900 });
    expect(row!.trial_ends_at!.getTime()).toBeGreaterThan(
      Date.now() + 6 * 86_400_000,
    );
    expect(await access.isActive(a.id)).toBe(true);
    // A second start while active is refused.
    expect(
      (await api().post('/api/v1/subscriptions/start').set(a.auth)).status,
    ).toBe(409);

    // Trial ends: Stripe charges and reports the subscription active.
    const now = Math.floor(Date.now() / 1000);
    const inv = `in_${randomUUID().slice(0, 8)}`;
    const paid = await webhook('invoice.paid', {
      object: 'invoice',
      id: inv,
      customer: null,
      subscription: row!.stripe_subscription_id,
      amount_paid: 39_900,
      currency: 'usd',
      status: 'paid',
      paid_at: now,
      payment_intent: `pi_${inv}`,
      _version: 1,
    });
    expect(paid.res.status).toBe(200);
    expect((paid.res.body as Body).data).toEqual({
      received: true,
      queued: true,
    });
    await processed(paid.id);
    const active = await webhook(
      'customer.subscription.updated',
      subObject(row!, {
        status: 'active',
        current_period_end: now + 30 * 86_400,
        _version: 2,
      }),
    );
    await processed(active.id);
    expect(
      (
        await prisma.subscription.findUniqueOrThrow({
          where: { user_id: a.id },
        })
      ).status,
    ).toBe('active');
    expect(
      await prisma.payment.count({
        where: { user_id: a.id, status: 'succeeded' },
      }),
    ).toBe(1);

    // The same event again: stored once, no second payment.
    const dup = await webhook(
      'invoice.paid',
      {
        object: 'invoice',
        id: inv,
        subscription: row!.stripe_subscription_id,
        amount_paid: 39_900,
        currency: 'usd',
        status: 'paid',
        paid_at: now,
        _version: 1,
      },
      paid.id,
    );
    expect((dup.res.body as Body).data).toEqual({
      received: true,
      queued: false,
    });
    expect(await prisma.payment.count({ where: { user_id: a.id } })).toBe(1);
    // An older event arriving late (trialing, version 1) doesn't win.
    const late = await webhook(
      'customer.subscription.updated',
      subObject(row!, { status: 'trialing', _version: 1 }),
    );
    await processed(late.id);
    expect(
      (
        await prisma.subscription.findUniqueOrThrow({
          where: { user_id: a.id },
        })
      ).status,
    ).toBe('active');

    const history = await api()
      .get('/api/v1/subscriptions/payments')
      .set(a.auth)
      .expect(200);
    expect(
      (history.body as { data: Array<{ status: string; amountCents: number }> })
        .data,
    ).toEqual([
      expect.objectContaining({ status: 'succeeded', amountCents: 39_900 }),
    ]);
    // Bad signature.
    await api()
      .post('/api/v1/webhooks/stripe')
      .set('Stripe-Signature', 'nope')
      .send({
        id: 'x',
        type: 'y',
        data: { object: { object: 'subscription', id: 'z' } },
      })
      .expect(400);
  });

  it('failed payment → past_due with grace (still active) → unpaid → expired: bids withdrawn, notified, cache dropped', async () => {
    const a = await attorney();
    const { row } = await subscribe(a, `fp_${randomUUID().slice(0, 8)}`);
    const bid = await bidFor(a.id);
    expect(await access.isActive(a.id)).toBe(true);

    const failed = await webhook('invoice.payment_failed', {
      object: 'invoice',
      id: `in_${randomUUID().slice(0, 8)}`,
      subscription: row!.stripe_subscription_id,
      amount_due: 39_900,
      currency: 'usd',
      status: 'open',
      failure_code: 'card_declined',
      _version: 1,
    });
    await processed(failed.id);
    const pastDue = await prisma.subscription.findUniqueOrThrow({
      where: { user_id: a.id },
    });
    expect(pastDue.status).toBe('past_due');
    expect(pastDue.grace_ends_at!.getTime()).toBeGreaterThan(
      Date.now() + 2 * 86_400_000,
    );
    expect(await access.isActive(a.id)).toBe(true); // grace
    expect(
      await prisma.notification.count({
        where: { user_id: a.id, type: 'subscription_payment_failed' },
      }),
    ).toBe(1);
    expect(
      await prisma.payment.count({
        where: { user_id: a.id, status: 'failed' },
      }),
    ).toBe(1);
    expect(
      (await prisma.bid.findUniqueOrThrow({ where: { id: bid.id } })).status,
    ).toBe('active');

    // Stripe gives up: unpaid → expired, access lost, bids withdrawn.
    const unpaid = await webhook(
      'customer.subscription.updated',
      subObject(row!, { status: 'unpaid', _version: 3 }),
    );
    await processed(unpaid.id);
    const lapsed = await prisma.subscription.findUniqueOrThrow({
      where: { user_id: a.id },
    });
    expect(lapsed.status).toBe('expired');
    expect(await access.isActive(a.id)).toBe(false);
    expect(
      (await prisma.bid.findUniqueOrThrow({ where: { id: bid.id } })).status,
    ).toBe('withdrawn');
    expect(
      await prisma.notification.count({
        where: { user_id: a.id, type: 'subscription_status' },
      }),
    ).toBe(1);
    // Re-subscribing after expiry: the trial is spent → chargeNow required.
    const again = await subscribe(a, `fp_${randomUUID().slice(0, 8)}`);
    expect(again.confirm.status).toBe(409);
    expect((again.confirm.body as Body).error?.code).toBe(
      'SUBSCRIPTION_TRIAL_UNAVAILABLE',
    );
    const charged = await subscribe(a, `fp_${randomUUID().slice(0, 8)}`, true);
    expect(charged.confirm.status).toBe(200);
    expect(charged.row).toMatchObject({
      status: 'active',
      trial_started_at: expect.any(Date),
    });
    expect(await access.isActive(a.id)).toBe(true);
  });

  it('one trial per card: another attorney with the same fingerprint gets no trial; cancel keeps access until period end', async () => {
    const fp = `fp_shared_${randomUUID().slice(0, 6)}`;
    const first = await attorney();
    expect((await subscribe(first, fp)).confirm.status).toBe(200);
    const second = await attorney();
    const refused = await subscribe(second, fp);
    expect(refused.confirm.status).toBe(409);
    expect((refused.confirm.body as Body).error).toMatchObject({
      code: 'SUBSCRIPTION_TRIAL_UNAVAILABLE',
      details: { chargeNowCents: 39_900 },
    });
    const chargedNow = await subscribe(second, fp, true);
    expect(chargedNow.row).toMatchObject({
      status: 'active',
      trial_started_at: null,
      card_fingerprint: fp,
    });

    const canceled = await api()
      .post('/api/v1/subscriptions/cancel')
      .set(first.auth)
      .expect(200);
    expect((canceled.body as Body).data).toMatchObject({
      isActive: true,
      subscription: expect.objectContaining({
        cancelAtPeriodEnd: true,
        status: 'trialing',
      }),
    });
    const portal = await api()
      .post('/api/v1/subscriptions/portal-session')
      .set(first.auth)
      .expect(200);
    expect((portal.body as Body).data.url).toContain('/portal/');
    // The reminder is skipped once canceled.
    await runner.runTrialReminderNow(
      (
        await prisma.subscription.findUniqueOrThrow({
          where: { user_id: first.id },
        })
      ).id,
    );
    expect(
      await prisma.notification.count({
        where: { user_id: first.id, type: 'subscription_trial_ending' },
      }),
    ).toBe(0);
  });

  it('trial reminder notifies with the date and amount', async () => {
    const a = await attorney();
    const { row } = await subscribe(a, `fp_${randomUUID().slice(0, 8)}`);
    await runner.runTrialReminderNow(row!.id);
    const n = await prisma.notification.findFirst({
      where: { user_id: a.id, type: 'subscription_trial_ending' },
    });
    expect(n?.payload).toMatchObject({
      amountCents: 39_900,
      trialEndsAt: row!.trial_ends_at!.toISOString(),
    });
  });

  it('admin: support views, finance extends by N days with a reason (audited), moderator is 403', async () => {
    const a = await attorney();
    const { row } = await subscribe(a, `fp_${randomUUID().slice(0, 8)}`);
    const support = await adminSession(baseUrl, prisma, 'support');
    const finance = await adminSession(baseUrl, prisma, 'finance');
    const moderator = await adminSession(baseUrl, prisma, 'moderator');
    await api()
      .get(`/api/v1/admin/subscriptions/${a.id}`)
      .set(moderator.auth)
      .expect(403);
    const view = await api()
      .get(`/api/v1/admin/subscriptions/${a.id}`)
      .set(support.auth)
      .expect(200);
    expect((view.body as Body).data).toMatchObject({
      stripeSubscriptionId: row!.stripe_subscription_id,
      subscription: expect.objectContaining({ status: 'trialing' }),
    });
    await api()
      .post(`/api/v1/admin/subscriptions/${a.id}/extend`)
      .set(support.auth)
      .send({ days: 5, reason: 'x' })
      .expect(403);
    const before = row!.trial_ends_at!.getTime();
    const ext = await api()
      .post(`/api/v1/admin/subscriptions/${a.id}/extend`)
      .set(finance.auth)
      .send({
        days: 10,
        reason: 'Compensation for a confirmed contact issue (report 42)',
      })
      .expect(200);
    const after = new Date(
      ((ext.body as Body).data.subscription as { trialEndsAt: string })
        .trialEndsAt,
    ).getTime();
    expect(after - before).toBeGreaterThanOrEqual(9.9 * 86_400_000);
    const audit = await prisma.auditLog.findFirst({
      where: { admin_id: finance.userId, action: 'subscription.extend' },
    });
    expect(audit).toMatchObject({
      target_id: row!.id,
      after: expect.objectContaining({ days: 10 }),
    });
    expect(
      await prisma.notification.count({
        where: { user_id: a.id, type: 'subscription_status' },
      }),
    ).toBe(1);
  });

  // Owner 2026-09-30: the web payment page (Stripe Checkout).
  it('web checkout: hosted page → paid → trialing; a used card pays now; idempotent', async () => {
    const a = await attorney();
    const start = await api()
      .post('/api/v1/subscriptions/checkout')
      .set(a.auth)
      .expect(200);
    const c = (start.body as Body).data as {
      url: string;
      sessionId: string;
      trialEligible: boolean;
    };
    expect(c.trialEligible).toBe(true);
    expect(c.url).toContain(`/subscriptions/fake-checkout/${c.sessionId}`);

    // Not paid yet: complete changes nothing.
    const early = await api()
      .post('/api/v1/subscriptions/checkout/complete')
      .set(a.auth)
      .send({ sessionId: c.sessionId })
      .expect(200);
    expect((early.body as Body).data.isActive).toBe(false);

    await fake.payCheckout(c.sessionId, {
      paymentMethodId: 'pm_web_1',
      fingerprint: 'fp_web_shared',
    });
    const done = await api()
      .post('/api/v1/subscriptions/checkout/complete')
      .set(a.auth)
      .send({ sessionId: c.sessionId })
      .expect(200);
    const me = (done.body as Body).data as {
      subscription: { status: string };
      isActive: boolean;
    };
    expect(me.subscription.status).toBe('trialing');
    expect(me.isActive).toBe(true);
    // Twice is the same.
    await api()
      .post('/api/v1/subscriptions/checkout/complete')
      .set(a.auth)
      .send({ sessionId: c.sessionId })
      .expect(200);
    expect(await prisma.subscription.count({ where: { user_id: a.id } })).toBe(
      1,
    );
    // A second checkout while active is refused.
    const again = await api()
      .post('/api/v1/subscriptions/checkout')
      .set(a.auth);
    expect(again.status).toBe(409);

    // Another attorney with the same card: no second trial.
    const b = await attorney();
    const sb = (
      (await api().post('/api/v1/subscriptions/checkout').set(b.auth))
        .body as Body
    ).data as { sessionId: string };
    await fake.payCheckout(sb.sessionId, {
      paymentMethodId: 'pm_web_2',
      fingerprint: 'fp_web_shared',
    });
    const bMe = (
      (
        await api()
          .post('/api/v1/subscriptions/checkout/complete')
          .set(b.auth)
          .send({ sessionId: sb.sessionId })
      ).body as Body
    ).data as { subscription: { status: string } };
    expect(bMe.subscription.status).not.toBe('trialing');

    // Someone else's session is ignored.
    const other = await attorney();
    const foreign = await api()
      .post('/api/v1/subscriptions/checkout/complete')
      .set(other.auth)
      .send({ sessionId: c.sessionId })
      .expect(200);
    expect((foreign.body as Body).data.isActive).toBe(false);
  });

  it('the dev payment page renders and pays (fake provider only)', async () => {
    const a = await attorney();
    const c = (
      (await api().post('/api/v1/subscriptions/checkout').set(a.auth))
        .body as Body
    ).data as { sessionId: string };
    const pageRes = await api()
      .get(`/api/v1/subscriptions/fake-checkout/${c.sessionId}`)
      .expect(200);
    expect(pageRes.text).toContain('Attorney subscription');
    await api()
      .post(`/api/v1/subscriptions/fake-checkout/${c.sessionId}/pay`)
      .expect(201);
    expect(await access.isActive(a.id)).toBe(true);
  });

  // OQ-048: plans — monthly + bought assistant seats, yearly with all six;
  // phones given at purchase join without a code.
  it('plans: yearly with assistant phones; monthly seats change later', async () => {
    const a = await attorney();
    const phoneA = '+13125550771';
    const start = await api()
      .post('/api/v1/subscriptions/checkout')
      .set(a.auth)
      .send({ plan: 'yearly', assistantPhones: [phoneA] })
      .expect(200);
    const c = (start.body as Body).data as {
      sessionId: string;
      priceCents: number;
    };
    expect(c.priceCents).toBe(959_000);
    await fake.payCheckout(c.sessionId, {
      paymentMethodId: 'pm_year',
      fingerprint: 'fp_year',
    });
    const done = await api()
      .post('/api/v1/subscriptions/checkout/complete')
      .set(a.auth)
      .send({ sessionId: c.sessionId })
      .expect(200);
    expect((done.body as Body).data.subscription).toMatchObject({
      plan: 'yearly',
    });
    const team = await api().get('/api/v1/team').set(a.auth).expect(200);
    expect((team.body as Body).data).toMatchObject({ seats: 6, used: 1 });
    expect(
      (
        (team.body as Body).data as {
          members: { phone: string; approval: string }[];
        }
      ).members[0],
    ).toMatchObject({ phone: phoneA, approval: 'purchase' });
    // Yearly already includes the seats.
    const seats = await api()
      .post('/api/v1/subscriptions/seats')
      .set(a.auth)
      .send({ seats: 2 });
    expect(seats.status).toBe(409);

    const m = await attorney();
    const sm = (
      (
        await api()
          .post('/api/v1/subscriptions/checkout')
          .set(m.auth)
          .send({ plan: 'monthly', assistantSeats: 2 })
      ).body as Body
    ).data as { sessionId: string; priceCents: number };
    expect(sm.priceCents).toBe(39_900 + 2 * 10_000);
    await fake.payCheckout(sm.sessionId, {
      paymentMethodId: 'pm_month',
      fingerprint: 'fp_month',
    });
    await api()
      .post('/api/v1/subscriptions/checkout/complete')
      .set(m.auth)
      .send({ sessionId: sm.sessionId })
      .expect(200);
    const up = await api()
      .post('/api/v1/subscriptions/seats')
      .set(m.auth)
      .send({ seats: 3 })
      .expect(200);
    expect(
      ((up.body as Body).data as { subscription: { assistantSeats: number } })
        .subscription.assistantSeats,
    ).toBe(3);
  });

  // Owner 2026-10-01: an active monthly subscription moves to yearly Prime.
  it('monthly → yearly Prime', async () => {
    const a = await attorney();
    const c = (
      (
        await api()
          .post('/api/v1/subscriptions/checkout')
          .set(a.auth)
          .send({ plan: 'monthly', assistantSeats: 1 })
      ).body as Body
    ).data as { sessionId: string };
    await fake.payCheckout(c.sessionId, {
      paymentMethodId: 'pm_prime',
      fingerprint: 'fp_prime',
    });
    await api()
      .post('/api/v1/subscriptions/checkout/complete')
      .set(a.auth)
      .send({ sessionId: c.sessionId })
      .expect(200);
    const up = await api()
      .post('/api/v1/subscriptions/plan/yearly')
      .set(a.auth)
      .expect(200);
    expect(
      (
        (up.body as Body).data as {
          subscription: { plan: string; assistantSeats: number };
        }
      ).subscription,
    ).toMatchObject({ plan: 'yearly', assistantSeats: 6 });
    const again = await api()
      .post('/api/v1/subscriptions/plan/yearly')
      .set(a.auth);
    expect(again.status).toBe(409);
  });
});
