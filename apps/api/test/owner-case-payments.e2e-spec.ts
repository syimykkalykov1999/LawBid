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
import type { FakePaymentProvider } from '../src/modules/billing/fake-payment.provider';
import { FeatureFlagsService } from '../src/modules/feature-flags/services/feature-flags.service';
import { CasePaymentsService } from '../src/modules/case-payments/case-payments.service';
import { PAYMENT_SETTINGS_KEY } from '../src/modules/case-payments/case-payments.settings';
import { adminSession } from './support/admin-login';

jest.setTimeout(180_000);

interface Body {
  data: Record<string, unknown>;
  error?: { code: string; details?: Record<string, unknown> };
}

/**
 * Owner 2026-10-05: the client pays the attorney at work on their case
 * through the platform (Stripe Connect direct charges, fake provider in
 * e2e). Flag off → 403; the attorney onboards a payout account; the
 * client pays the bid, sees the receipt, the attorney sees it received;
 * refund by the attorney; dispute from a webhook; admin list / settings
 * with the fee-sharing warning / CSV; a sent and processed Connect
 * webhook with a repeated id creates no duplicates.
 */
describe('owner — client → attorney payments (e2e, fake provider)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let fake: FakePaymentProvider;
  let flags: FeatureFlagsService;
  let service: CasePaymentsService;
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
    flags = app.get(FeatureFlagsService);
    service = app.get(CasePaymentsService);
    expect(fake.name).toBe('fake');
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey', is_active: true },
      update: {},
    });
    practiceAreaId = (
      await prisma.practiceArea.upsert({
        where: { code: 'e2e_payments_leaf' },
        create: {
          code: 'e2e_payments_leaf',
          name_en: 'E2E payments',
          i18n_key: 'practice.e2e_payments_leaf',
          sort: 1,
        },
        update: {},
      })
    ).id;
    await prisma.appConfig.deleteMany({ where: { key: PAYMENT_SETTINGS_KEY } });
    await setFlag(true);
  });

  afterAll(async () => {
    await setFlag(false);
    await app.close();
  });

  async function setFlag(enabled: boolean): Promise<void> {
    await prisma.featureFlag.upsert({
      where: { key: 'payments_in_app' },
      create: { key: 'payments_in_app', enabled },
      update: { enabled },
    });
    await flags.invalidate();
  }

  function auth(id: string, role: 'attorney' | 'client', verified = false) {
    return {
      Authorization: `Bearer ${tokens.signAccessToken({ sub: id, role, sid: randomUUID(), verified, subscriptionStatus: role === 'attorney' ? 'active' : 'none' })}`,
    };
  }

  async function attorney() {
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
            verification_status: 'verified',
          },
        },
      },
    });
    return { id: u.id, auth: auth(u.id, 'attorney', true) };
  }

  async function client() {
    const u = await prisma.user.create({
      data: {
        role: 'client',
        email: `cl_${randomUUID().slice(0, 8)}@lawbid-e2e.test`,
      },
    });
    return { id: u.id, auth: auth(u.id, 'client') };
  }

  /** A case in progress with [att]'s fixed bid accepted. */
  async function caseInProgress(
    cli: { id: string },
    att: { id: string },
    amountCents = 50_000,
  ) {
    const c = await prisma.case.create({
      data: {
        client_id: cli.id,
        title: 'Payments case',
        description: 'A case whose attorney is paid through the platform.',
        practice_area_id: practiceAreaId,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'NJ', is_primary: true },
    });
    const bid = await prisma.bid.create({
      data: {
        case_id: c.id,
        attorney_id: att.id,
        fee_type: 'fixed',
        amount_cents: amountCents,
        message: 'I handle these every week and can start today.',
        start_availability: 'immediately',
        turn: 'client',
        status: 'accepted',
        decided_at: new Date(),
      },
    });
    await prisma.case.update({
      where: { id: c.id },
      data: { accepted_bid_id: bid.id, status: 'in_progress' },
    });
    return { id: c.id, bidId: bid.id };
  }

  /** Attorney onboarding through the API + the fake Stripe page. */
  async function onboard(att: { id: string; auth: Record<string, string> }) {
    const start = await api()
      .post('/api/v1/payout-account/onboarding')
      .set(att.auth)
      .expect(201);
    const url = (start.body as Body).data.url as string;
    expect(url).toContain('/fake-checkout/connect/');
    const row = await prisma.payoutAccount.findUniqueOrThrow({
      where: { user_id: att.id },
    });
    expect(row.status).toBe('onboarding');
    fake.completeConnectOnboarding(row.stripe_account_id);
    // Stripe tells us through the Connect webhook.
    const { id } = await connectWebhook(
      'account.updated',
      { object: 'account', id: row.stripe_account_id },
      row.stripe_account_id,
    );
    await processed(id);
    return row.stripe_account_id;
  }

  async function connectWebhook(
    type: string,
    object: Record<string, unknown>,
    account: string,
    id = `evt_${++eventSeq}_${randomUUID().slice(0, 6)}`,
  ) {
    const res = await api()
      .post('/api/v1/webhooks/stripe/connect')
      .set('Stripe-Signature', 'fake')
      .set('Content-Type', 'application/json')
      .send({
        id,
        type,
        account,
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

  async function pay(
    cli: { auth: Record<string, string> },
    caseId: string,
    body: Record<string, unknown>,
  ) {
    const res = await api()
      .post(`/api/v1/cases/${caseId}/payments`)
      .set(cli.auth)
      .set('Idempotency-Key', randomUUID())
      .send(body);
    return res;
  }

  it('flag off: everything is 403 FEATURE_DISABLED and the settings say so', async () => {
    await setFlag(false);
    const att = await attorney();
    const cli = await client();
    const c = await caseInProgress(cli, att);
    const s = await api()
      .get('/api/v1/payments/settings')
      .set(cli.auth)
      .expect(200);
    expect((s.body as Body).data.enabled).toBe(false);
    const state = await api()
      .get(`/api/v1/cases/${c.id}/payments`)
      .set(cli.auth)
      .expect(200);
    expect((state.body as Body).data).toMatchObject({
      enabled: false,
      canPay: false,
    });
    const denied = await pay(cli, c.id, { kind: 'bid' });
    expect(denied.status).toBe(403);
    expect((denied.body as Body).error?.code).toBe('FEATURE_DISABLED');
    const ob = await api()
      .post('/api/v1/payout-account/onboarding')
      .set(att.auth);
    expect(ob.status).toBe(403);
    await setFlag(true);
  });

  it('attorney onboards a payout account; clients and assistants cannot', async () => {
    const att = await attorney();
    const cli = await client();
    await api()
      .post('/api/v1/payout-account/onboarding')
      .set(cli.auth)
      .expect(403);
    const none = await api()
      .get('/api/v1/payout-account')
      .set(att.auth)
      .expect(200);
    expect((none.body as Body).data).toMatchObject({
      status: 'none',
      canReceive: false,
      available: true,
    });

    await onboard(att);
    const ready = await api()
      .get('/api/v1/payout-account')
      .set(att.auth)
      .expect(200);
    expect((ready.body as Body).data).toMatchObject({
      status: 'active',
      canReceive: true,
      chargesEnabled: true,
      payoutsEnabled: true,
      requirementsDue: [],
    });
    const dash = await api()
      .post('/api/v1/payout-account/dashboard')
      .set(att.auth)
      .expect(201);
    expect((dash.body as Body).data.url).toContain('connect.stripe.com');
    const notified = await prisma.notification.findFirst({
      where: { user_id: att.id, type: 'payout_account_status' },
    });
    expect(notified).not.toBeNull();
  });

  it('client cannot pay before the attorney is ready (PAYOUT_ACCOUNT_NOT_READY)', async () => {
    const att = await attorney();
    const cli = await client();
    const c = await caseInProgress(cli, att);
    const state = await api()
      .get(`/api/v1/cases/${c.id}/payments`)
      .set(cli.auth)
      .expect(200);
    expect((state.body as Body).data).toMatchObject({
      enabled: true,
      attorneyReady: false,
      canPay: false,
      bidAmountCents: 50_000,
      remainingCents: 50_000,
    });
    const res = await pay(cli, c.id, { kind: 'bid' });
    expect(res.status).toBe(409);
    expect((res.body as Body).error?.code).toBe('PAYOUT_ACCOUNT_NOT_READY');
  });

  it('client pays the bid: money goes to the attorney, platform fee is the admin setting, both sides see it', async () => {
    const att = await attorney();
    const cli = await client();
    const stranger = await client();
    const acct = await onboard(att);
    const c = await caseInProgress(cli, att);

    // Only the case's client can pay; the attorney cannot pay themselves.
    await api()
      .post(`/api/v1/cases/${c.id}/payments`)
      .set(stranger.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ kind: 'bid' })
      .expect(404);
    const self = await pay({ auth: att.auth }, c.id, { kind: 'bid' });
    expect(self.status).toBe(403);

    const quote = await api()
      .get('/api/v1/payments/quote?amountCents=50000')
      .set(cli.auth)
      .expect(200);
    const q = (quote.body as Body).data as Record<string, number>;
    // Default: no platform fee; Stripe's processing estimate is passed on.
    expect(q.platformFeeCents).toBe(0);
    expect(q.attorneyNetCents).toBe(50_000);
    expect(q.clientTotalCents).toBeGreaterThan(50_000);

    const created = await pay(cli, c.id, { kind: 'bid', note: 'Thank you' });
    expect(created.status).toBe(201);
    const data = (created.body as Body).data as {
      paymentId: string;
      checkoutUrl: string;
      payment: Record<string, unknown>;
    };
    expect(data.checkoutUrl).toContain('/fake-checkout/');
    expect(data.payment).toMatchObject({
      status: 'pending_payment',
      kind: 'bid',
      amountCents: 50_000,
    });
    const row = await prisma.casePayment.findUniqueOrThrow({
      where: { id: data.paymentId },
    });
    expect(row.stripe_account_id).toBe(acct);
    expect(row.client_total_cents).toBe(q.clientTotalCents);

    // The client pays on the (fake) Stripe page; the Connect webhook lands.
    await api()
      .post(`/api/v1/subscriptions/fake-checkout/${row.stripe_checkout_id}/pay`)
      .expect(200);
    const { id: evt } = await connectWebhook(
      'checkout.session.completed',
      {
        object: 'checkout.session',
        id: row.stripe_checkout_id,
        metadata: { kind: 'case_payment', paymentId: row.id },
      },
      acct,
    );
    await processed(evt);
    // Same event again: no duplicate, no change.
    const again = await connectWebhook(
      'checkout.session.completed',
      {
        object: 'checkout.session',
        id: row.stripe_checkout_id,
        metadata: { kind: 'case_payment', paymentId: row.id },
      },
      acct,
      evt,
    );
    expect(again.res.status).toBeLessThan(300);

    const paid = await prisma.casePayment.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(paid.status).toBe('succeeded');
    expect(paid.paid_at).not.toBeNull();
    expect(paid.stripe_payment_intent_id).toMatch(/^pi_fake_/);
    expect(paid.receipt_url).toContain('receipts');
    expect(await prisma.casePayment.count({ where: { case_id: c.id } })).toBe(
      1,
    );

    const state = await api()
      .get(`/api/v1/cases/${c.id}/payments`)
      .set(cli.auth)
      .expect(200);
    expect((state.body as Body).data).toMatchObject({
      paidCents: 50_000,
      remainingCents: 0,
    });
    const items = (state.body as Body).data.items as Record<string, unknown>[];
    expect(items[0]).toMatchObject({
      status: 'succeeded',
      receiptUrl: paid.receipt_url,
      refundable: true,
    });

    const attView = await api()
      .get(`/api/v1/cases/${c.id}/payments`)
      .set(att.auth)
      .expect(200);
    expect((attView.body as Body).data).toMatchObject({
      canPay: false,
      paidCents: 50_000,
    });

    const hist = await api()
      .get('/api/v1/payments/history')
      .set(att.auth)
      .expect(200);
    expect(
      ((hist.body as Body).data as unknown as Record<string, unknown>[])[0],
    ).toMatchObject({ id: row.id });
    const summary = await api()
      .get('/api/v1/payments/summary')
      .set(att.auth)
      .expect(200);
    expect((summary.body as Body).data).toMatchObject({
      totalCents: 50_000,
      count: 1,
    });
    const one = await api()
      .get(`/api/v1/payments/${row.id}`)
      .set(cli.auth)
      .expect(200);
    expect((one.body as Body).data.note).toBe('Thank you');
    await api()
      .get(`/api/v1/payments/${row.id}`)
      .set(stranger.auth)
      .expect(404);

    const [toAtt, toCli] = await Promise.all([
      prisma.notification.findFirst({
        where: { user_id: att.id, type: 'case_payment_received' },
      }),
      prisma.notification.findFirst({
        where: { user_id: cli.id, type: 'case_payment_sent' },
      }),
    ]);
    expect(toAtt).not.toBeNull();
    expect(toCli).not.toBeNull();

    // A second bid payment of a fully paid case is refused; custom works.
    const twice = await pay(cli, c.id, { kind: 'bid' });
    expect(twice.status).toBe(400);
    expect((twice.body as Body).error?.code).toBe('PAYMENT_AMOUNT_INVALID');
    const extra = await pay(cli, c.id, { kind: 'custom', amountCents: 10_000 });
    expect(extra.status).toBe(201);
    const cancel = await api()
      .post(
        `/api/v1/payments/${(extra.body as Body).data.paymentId as string}/cancel`,
      )
      .set(cli.auth)
      .expect(200);
    expect((cancel.body as Body).data.status).toBe('canceled');
  });

  it('deposit then balance; partial refund by the attorney; refund by a stranger is 404', async () => {
    const att = await attorney();
    const cli = await client();
    const other = await attorney();
    const acct = await onboard(att);
    const c = await caseInProgress(cli, att, 100_000);

    async function complete(paymentId: string) {
      const row = await prisma.casePayment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      fake.payConnectedCheckout(row.stripe_checkout_id!);
      // The app comes back from the browser before the webhook: the
      // state call checks the open session itself.
      await api()
        .get(`/api/v1/cases/${c.id}/payments`)
        .set(cli.auth)
        .expect(200);
      return prisma.casePayment.findUniqueOrThrow({ where: { id: paymentId } });
    }

    const dep = await pay(cli, c.id, { kind: 'deposit', amountCents: 30_000 });
    expect(dep.status).toBe(201);
    const depRow = await complete((dep.body as Body).data.paymentId as string);
    expect(depRow.status).toBe('succeeded');

    const mid = await api()
      .get(`/api/v1/cases/${c.id}/payments`)
      .set(cli.auth)
      .expect(200);
    expect((mid.body as Body).data).toMatchObject({
      paidCents: 30_000,
      remainingCents: 70_000,
    });

    const tooMuch = await pay(cli, c.id, {
      kind: 'custom',
      amountCents: 5_000_000,
    });
    expect(tooMuch.status).toBe(400);

    const bal = await pay(cli, c.id, { kind: 'balance' });
    expect(bal.status).toBe(201);
    expect((bal.body as Body).data.payment).toMatchObject({
      amountCents: 70_000,
    });
    const balRow = await complete((bal.body as Body).data.paymentId as string);
    expect(balRow.status).toBe('succeeded');

    // Refunds: the attorney only (an assistant or another attorney: 404).
    await api()
      .post(`/api/v1/payments/${depRow.id}/refund`)
      .set(other.auth)
      .send({ reason: 'not mine' })
      .expect(404);
    await api()
      .post(`/api/v1/payments/${depRow.id}/refund`)
      .set(cli.auth)
      .send({ reason: 'client cannot' })
      .expect(403);
    const part = await api()
      .post(`/api/v1/payments/${depRow.id}/refund`)
      .set(att.auth)
      .send({ amountCents: 10_000, reason: 'Less work than expected' })
      .expect(200);
    expect((part.body as Body).data).toMatchObject({
      status: 'partially_refunded',
      refundedCents: 10_000,
    });
    const refunds = await prisma.casePaymentRefund.findMany({
      where: { payment_id: depRow.id },
    });
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({
      status: 'succeeded',
      initiated_by_type: 'attorney',
      initiated_by: att.id,
    });
    const charge = await fake.retrieveConnectedCharge(
      acct,
      depRow.stripe_charge_id!,
    );
    expect(charge?.amountRefundedCents).toBe(10_000);
    const refundedNotice = await prisma.notification.findFirst({
      where: { user_id: cli.id, type: 'case_payment_refunded' },
    });
    expect(refundedNotice).not.toBeNull();

    const full = await api()
      .post(`/api/v1/payments/${depRow.id}/refund`)
      .set(att.auth)
      .send({ reason: 'Case dropped' })
      .expect(200);
    expect((full.body as Body).data).toMatchObject({
      status: 'refunded',
      refundable: false,
    });
    const over = await api()
      .post(`/api/v1/payments/${depRow.id}/refund`)
      .set(att.auth)
      .send({ reason: 'Nothing left' });
    expect(over.status).toBe(409);
    expect((over.body as Body).error?.code).toBe('PAYMENT_INVALID_STATE');

    const after = await api()
      .get(`/api/v1/cases/${c.id}/payments`)
      .set(cli.auth)
      .expect(200);
    expect((after.body as Body).data).toMatchObject({ paidCents: 70_000 });
  });

  it('a dispute from Stripe marks the payment; lost → refunded', async () => {
    const att = await attorney();
    const cli = await client();
    const acct = await onboard(att);
    const c = await caseInProgress(cli, att, 20_000);
    const res = await pay(cli, c.id, { kind: 'bid' });
    const id = (res.body as Body).data.paymentId as string;
    let row = await prisma.casePayment.findUniqueOrThrow({ where: { id } });
    fake.payConnectedCheckout(row.stripe_checkout_id!);
    expect(await service.applyCheckoutById(row.stripe_checkout_id!, acct)).toBe(
      true,
    );
    row = await prisma.casePayment.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('succeeded');

    const opened = await connectWebhook(
      'charge.dispute.created',
      {
        object: 'dispute',
        id: 'dp_1',
        charge: row.stripe_charge_id,
        status: 'needs_response',
        amount: row.client_total_cents,
      },
      acct,
    );
    await processed(opened.id);
    row = await prisma.casePayment.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      status: 'disputed',
      dispute_status: 'needs_response',
    });
    expect(
      await prisma.notification.findFirst({
        where: { user_id: att.id, type: 'case_payment_disputed' },
      }),
    ).not.toBeNull();

    const lost = await connectWebhook(
      'charge.dispute.closed',
      {
        object: 'dispute',
        id: 'dp_1',
        charge: row.stripe_charge_id,
        status: 'lost',
      },
      acct,
    );
    await processed(lost.id);
    row = await prisma.casePayment.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      status: 'refunded',
      dispute_status: 'lost',
      refunded_cents: row.client_total_cents,
    });
    expect(
      await prisma.casePaymentRefund.count({
        where: { payment_id: id, initiated_by_type: 'stripe' },
      }),
    ).toBe(1);
  });

  it('stale checkouts expire; a new payment supersedes an open one', async () => {
    const att = await attorney();
    const cli = await client();
    await onboard(att);
    const c = await caseInProgress(cli, att);
    const first = await pay(cli, c.id, { kind: 'custom', amountCents: 1_000 });
    const firstId = (first.body as Body).data.paymentId as string;
    const second = await pay(cli, c.id, { kind: 'custom', amountCents: 2_000 });
    expect(second.status).toBe(201);
    expect(
      (await prisma.casePayment.findUniqueOrThrow({ where: { id: firstId } }))
        .status,
    ).toBe('canceled');
    const secondId = (second.body as Body).data.paymentId as string;
    await prisma.casePayment.update({
      where: { id: secondId },
      data: { created_at: new Date(Date.now() - 2 * 86_400_000) },
    });
    const out = await service.expire();
    expect(out.abandoned).toBeGreaterThanOrEqual(1);
    expect(
      (await prisma.casePayment.findUniqueOrThrow({ where: { id: secondId } }))
        .status,
    ).toBe('canceled');
  });

  it('admin: settings (no percent fee, editable disclaimer), list + filters, stats, payout accounts, refund, CSV', async () => {
    const root = await adminSession(baseUrl, prisma, 'super_admin');
    const att = await attorney();
    const cli = await client();
    const acct = await onboard(att);
    const c = await caseInProgress(cli, att, 40_000);
    const res = await pay(cli, c.id, { kind: 'bid' });
    const id = (res.body as Body).data.paymentId as string;
    const row = await prisma.casePayment.findUniqueOrThrow({ where: { id } });
    fake.payConnectedCheckout(row.stripe_checkout_id!);
    await service.applyCheckoutById(row.stripe_checkout_id!, acct);

    const s0 = await api()
      .get('/api/v1/admin/case-payments/settings')
      .set(root.auth)
      .expect(200);
    expect((s0.body as Body).data).toMatchObject({
      feeType: 'none',
      feeFixedCents: 0,
      feePayer: 'client',
      flagEnabled: true,
    });
    const body = { ...(s0.body as Body).data } as Record<string, unknown>;
    delete body.flagEnabled;
    delete body.stripeConfigured;
    const s1 = await api()
      .put('/api/v1/admin/case-payments/settings')
      .set(root.auth)
      .send({
        ...body,
        feeType: 'fixed',
        feeFixedCents: 500,
        feePayer: 'attorney',
        disclaimerEn: 'Custom disclaimer EN',
      })
      .expect(200);
    expect((s1.body as Body).data).toMatchObject({
      feeType: 'fixed',
      disclaimerEn: 'Custom disclaimer EN',
    });
    const pub = await api()
      .get('/api/v1/payments/settings')
      .set(cli.auth)
      .expect(200);
    expect((pub.body as Body).data).toMatchObject({
      feeType: 'fixed',
      feeFixedCents: 500,
      disclaimerEn: 'Custom disclaimer EN',
    });
    const q = await api()
      .get('/api/v1/payments/quote?amountCents=10000')
      .set(cli.auth)
      .expect(200);
    expect((q.body as Body).data).toMatchObject({
      platformFeeCents: 500,
      attorneyNetCents: 9_500,
    });
    await api()
      .put('/api/v1/admin/case-payments/settings')
      .set(root.auth)
      .send({
        ...body,
        feeType: 'fixed',
        feeFixedCents: 300,
        feePayer: 'client',
      })
      .expect(200);
    expect(
      await prisma.auditLog.count({
        where: { action: 'case_payments.settings', admin_id: root.userId },
      }),
    ).toBe(2);

    const list = await api()
      .get(`/api/v1/admin/case-payments?userId=${att.id}`)
      .set(root.auth)
      .expect(200);
    const items = (list.body as Body).data as unknown as Record<
      string,
      unknown
    >[];
    expect(items.map((i) => i.id)).toContain(id);
    expect(items.find((i) => i.id === id)).toMatchObject({
      status: 'succeeded',
      stripeAccountId: acct,
      refunds: [],
    });
    const none = await api()
      .get(`/api/v1/admin/case-payments?userId=${att.id}&status=refunded`)
      .set(root.auth)
      .expect(200);
    expect((none.body as Body).data).toEqual([]);

    const stats = await api()
      .get('/api/v1/admin/case-payments/stats')
      .set(root.auth)
      .expect(200);
    const st = (stats.body as Body).data as Record<string, number>;
    expect(st.volumeAllCents).toBeGreaterThanOrEqual(40_000);
    expect(st.payoutAccountsActive).toBeGreaterThanOrEqual(1);

    const accounts = await api()
      .get('/api/v1/admin/case-payments/payout-accounts?status=active')
      .set(root.auth)
      .expect(200);
    const acc = (
      (accounts.body as Body).data as unknown as Record<string, unknown>[]
    ).find((a) => a.userId === att.id);
    expect(acc).toMatchObject({
      stripeAccountId: acct,
      status: 'active',
      receivedCents: 40_000,
    });
    const sync = await api()
      .post(`/api/v1/admin/case-payments/payout-accounts/${att.id}/sync`)
      .set(root.auth)
      .expect(200);
    expect(
      ((sync.body as Body).data.account as Record<string, unknown>).status,
    ).toBe('active');

    const refund = await api()
      .post(`/api/v1/admin/case-payments/${id}/refund`)
      .set(root.auth)
      .send({ amountCents: 5_000, reason: 'Support ticket #1' })
      .expect(200);
    expect((refund.body as Body).data).toMatchObject({
      status: 'partially_refunded',
      refundedCents: 5_000,
    });
    expect(
      ((refund.body as Body).data.refunds as Record<string, unknown>[])[0],
    ).toMatchObject({
      initiatedByType: 'admin',
      status: 'succeeded',
    });

    const csv = await api()
      .get('/api/v1/admin/export/case_payments')
      .set(root.auth)
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.split('\n')[0]).toContain('attorney_net_cents');
    expect(csv.text).toContain(id);
    const support = await adminSession(baseUrl, prisma, 'support');
    await api()
      .get('/api/v1/admin/export/case_payments')
      .set(support.auth)
      .expect(403);
    await api()
      .get('/api/v1/admin/case-payments')
      .set(support.auth)
      .expect(200);
    await api()
      .put('/api/v1/admin/case-payments/settings')
      .set(support.auth)
      .send(body)
      .expect(403);
  });
});
