import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { TokenService } from '../src/modules/auth/services/token.service';
import { PAYMENT_PROVIDER } from '../src/modules/billing/billing.constants';
import type { FakePaymentProvider } from '../src/modules/billing/fake-payment.provider';
import { proratedCents } from '../src/modules/billing/hotline-addon.logic';
import { dropAppConfigCache } from '../src/modules/feature-flags/services/app-config.service';
import { FeatureFlagsService } from '../src/modules/feature-flags/services/feature-flags.service';
import {
  EntitlementsService,
  hotlineAddonActive,
} from '../src/modules/plans/entitlements.service';

jest.setTimeout(120_000);

type Body = { data: Record<string, unknown>; error?: { code: string } };
type Addon = {
  priceCents: number;
  active: boolean;
  renews: boolean;
  endsAt: string | null;
  pending: boolean;
  canBuy: boolean;
};

/**
 * Owner row 87 (16.11, hotline plan PR 8): the «Горячая линия» add-on is
 * one more item of the attorney's ONE subscription. The plan builder's
 * price (`hotline_addon_price_cents`) becomes its own Stripe price; on =
 * the prorated rest of the period charged now, exactly the previewed
 * amount; off = no refund, it works to the period end; on again inside the
 * paid period costs nothing. Fake provider (the Stripe calls themselves are
 * proven in TEST mode by hotline-addon.stripe-test.spec.ts).
 */
describe('Hotline add-on billing (e2e, fake provider)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let fake: FakePaymentProvider;
  let entitlements: EntitlementsService;
  let flags: FeatureFlagsService;
  let redis: Redis;
  let baseUrl = '';
  const api = () => request(baseUrl);
  const planCode = `e2e_hl_${randomUUID().slice(0, 8)}`;

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
    entitlements = app.get(EntitlementsService);
    flags = app.get(FeatureFlagsService);
    redis = app.get<Redis>(REDIS_CLIENT);
    expect(fake.name).toBe('fake');
    await prisma.featureFlag.upsert({
      where: { key: 'hotline' },
      create: { key: 'hotline', enabled: true },
      update: { enabled: true },
    });
    await flags.invalidate();
    await prisma.appConfig.upsert({
      where: { key: 'hotline.mode' },
      create: { key: 'hotline.mode', value: 'by_subscription' },
      update: { value: 'by_subscription' },
    });
    await dropAppConfigCache(redis);
    await prisma.plan.create({
      data: {
        code: planCode,
        audience: 'attorney',
        kind: 'paid',
        interval: 'month',
        status: 'active',
        name: { en: 'E2E hotline', ru: 'E2E линия' },
        entitlements: { hotline_addon_price_cents: 4_900 },
      },
    });
  });

  afterAll(async () => {
    await prisma.featureFlag.deleteMany({ where: { key: 'hotline' } });
    await prisma.appConfig.deleteMany({ where: { key: 'hotline.mode' } });
    await dropAppConfigCache(redis);
    await flags.invalidate();
    await app.close();
  });

  /** A verified attorney on the plan, past the first paid invoice. */
  async function paidAttorney() {
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
    const auth = {
      Authorization: `Bearer ${tokens.signAccessToken({ sub: u.id, role: 'attorney', sid: randomUUID(), verified: true, subscriptionStatus: 'active' })}`,
    };
    const remote = await fake.createSubscription({
      customerId: `cus_${randomUUID().slice(0, 8)}`,
      priceId: 'price_fake_399',
      trialDays: null,
      paymentMethodId: 'pm_e2e',
      metadata: { userId: u.id },
    });
    const plan = await prisma.plan.findUniqueOrThrow({
      where: { code: planCode },
    });
    await prisma.subscription.create({
      data: {
        user_id: u.id,
        stripe_subscription_id: remote.id,
        status: 'active',
        price_cents: 39_900,
        plan_id: plan.id,
        current_period_start: new Date(remote.currentPeriodStart! * 1000),
        current_period_end: new Date(remote.currentPeriodEnd! * 1000),
      },
    });
    await prisma.payment.create({
      data: {
        user_id: u.id,
        stripe_invoice_id: `in_e2e_${randomUUID().slice(0, 8)}`,
        amount_cents: 39_900,
        status: 'succeeded',
        paid_at: new Date(),
      },
    });
    await entitlements.invalidateUser(u.id);
    return { id: u.id, auth, remote };
  }

  const addonOf = (res: { body: unknown }) =>
    ((res.body as Body).data as { hotlineAddon: Addon | null }).hotlineAddon;

  it('on → charged the previewed amount now; off → no refund to the period end; on again → free', async () => {
    const a = await paidAttorney();

    const me = await api().get('/api/v1/subscriptions/me').set(a.auth);
    expect(me.status).toBe(200);
    expect(addonOf(me)).toEqual({
      priceCents: 4_900,
      currency: 'usd',
      active: false,
      renews: false,
      endsAt: null,
      pending: false,
      canBuy: true,
    });

    // «К оплате сейчас»: the prorated rest of the period, to the cent.
    const preview = await api()
      .post('/api/v1/subscriptions/hotline/preview')
      .set(a.auth)
      .expect(200);
    const p = (preview.body as Body).data as {
      amountNowCents: number;
      prorationDate: number;
      priceCents: number;
      nextChargeCents: number;
    };
    expect(p.priceCents).toBe(4_900);
    expect(p.nextChargeCents).toBe(39_900 + 4_900);
    expect(p.amountNowCents).toBe(
      proratedCents(
        4_900,
        1,
        a.remote.currentPeriodStart!,
        a.remote.currentPeriodEnd!,
        p.prorationDate,
      ),
    );

    // The plan's add-on price got its own row (and Stripe price).
    const row = await prisma.planPrice.findFirst({
      where: { kind: `hotline.${planCode}`, active: true },
    });
    expect(row?.amount_cents).toBe(4_900);

    const on = await api()
      .post('/api/v1/subscriptions/hotline')
      .set(a.auth)
      .send({ enabled: true, prorationDate: p.prorationDate })
      .expect(200);
    expect((on.body as Body).data).toMatchObject({
      status: 'applied',
      amountCents: p.amountNowCents,
    });
    expect(fake.addons.get(a.remote.id)).toBe(1);
    // Never counted as an assistant seat.
    expect(fake.seats.get(a.remote.id) ?? 0).toBe(0);
    expect(addonOf(on)).toMatchObject({ active: true, renews: true });
    const sub = await prisma.subscription.findUniqueOrThrow({
      where: { user_id: a.id },
    });
    expect(sub.price_cents).toBe(39_900 + 4_900);
    // The hotline engine reads it from the plan entitlement.
    expect(hotlineAddonActive(await entitlements.forUser(a.id))).toBe(true);

    // Off: the item leaves Stripe now (next invoice without it), the add-on
    // keeps working to the end of the paid period; nothing is refunded.
    const off = await api()
      .post('/api/v1/subscriptions/hotline')
      .set(a.auth)
      .send({ enabled: false })
      .expect(200);
    const offData = (off.body as Body).data as {
      status: string;
      effectiveAt: string;
      amountCents: number;
    };
    expect(offData.status).toBe('scheduled');
    expect(offData.amountCents).toBe(0);
    expect(Date.parse(offData.effectiveAt)).toBe(
      a.remote.currentPeriodEnd! * 1000,
    );
    expect(fake.addons.get(a.remote.id)).toBe(0);
    expect(addonOf(off)).toMatchObject({
      active: true,
      renews: false,
      endsAt: offData.effectiveAt,
    });
    expect(hotlineAddonActive(await entitlements.forUser(a.id))).toBe(true);
    const offRow = await prisma.subscription.findUniqueOrThrow({
      where: { user_id: a.id },
    });
    expect(offRow.price_cents).toBe(39_900);

    // On again inside the paid period: no new charge.
    const free = await api()
      .post('/api/v1/subscriptions/hotline/preview')
      .set(a.auth)
      .expect(200);
    expect(
      ((free.body as Body).data as { amountNowCents: number }).amountNowCents,
    ).toBe(0);
    const again = await api()
      .post('/api/v1/subscriptions/hotline')
      .set(a.auth)
      .send({ enabled: true })
      .expect(200);
    expect((again.body as Body).data).toMatchObject({
      status: 'applied',
      amountCents: 0,
    });
    expect(fake.addons.get(a.remote.id)).toBe(1);
    expect(addonOf(again)).toMatchObject({ renews: true, endsAt: null });
  });

  it('not offered by the plan or not «По подписке»: nothing to buy', async () => {
    const a = await paidAttorney();
    await prisma.appConfig.update({
      where: { key: 'hotline.mode' },
      data: { value: 'on_for_all' },
    });
    await dropAppConfigCache(redis);
    try {
      const me = await api().get('/api/v1/subscriptions/me').set(a.auth);
      expect(addonOf(me)).toBeNull();
      const buy = await api()
        .post('/api/v1/subscriptions/hotline')
        .set(a.auth)
        .send({ enabled: true });
      expect(buy.status).toBe(409);
      expect((buy.body as Body).error?.code).toBe('ENTITLEMENT_REQUIRED');
    } finally {
      await prisma.appConfig.update({
        where: { key: 'hotline.mode' },
        data: { value: 'by_subscription' },
      });
      await dropAppConfigCache(redis);
    }
  });

  it('like seats: bought only after the first payment', async () => {
    const a = await paidAttorney();
    await prisma.payment.deleteMany({ where: { user_id: a.id } });
    const me = await api().get('/api/v1/subscriptions/me').set(a.auth);
    expect(addonOf(me)).toMatchObject({ canBuy: false, active: false });
    const buy = await api()
      .post('/api/v1/subscriptions/hotline')
      .set(a.auth)
      .send({ enabled: true });
    expect(buy.status).toBe(409);
    expect((buy.body as Body).error?.code).toBe('SEATS_NOT_PAID_YET');
  });
});
