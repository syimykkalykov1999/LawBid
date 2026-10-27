import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { CounterAggregator } from '../src/modules/counters/counter-aggregator.service';
import { BoostActions } from '../src/modules/promotions/boost-actions.service';
import { PromotionDeliveryService } from '../src/modules/promotions/promotion-delivery.service';
import { PromotionRefundsService } from '../src/modules/promotions/promotion-refunds.service';
import { DEFAULT_PRICING } from '../src/modules/promotions/promotions.settings';

/**
 * Owner 2026-10-27: a boost is paid per views, people, taps or real actions
 * (rewrite of #112), against real PostgreSQL/Redis:
 *  - everything new is OFF: with the stored defaults only views are offered;
 *  - the owner's switches decide what is offered, and a thing with every way
 *    to pay switched off cannot be boosted;
 *  - a purchase freezes the way to pay, the unit price, the units and the
 *    actions that count;
 *  - taps finish the boost at the target, and a boost that ends early gets
 *    the unspent part back (once) through the staff refund path;
 *  - a real action counts once per person, only for a person who was shown
 *    the boost, never for the owner.
 */
jest.setTimeout(90_000);

describe('Boost ways to pay (e2e, owner 2026-10-27)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let delivery: PromotionDeliveryService;
  let actions: BoostActions;
  let refunds: PromotionRefundsService;
  let counters: CounterAggregator;
  let baseUrl = '';
  const KEY = 'promotions.settings';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
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
    app.setGlobalPrefix('api/v1', {
      exclude: ['/health/live', '/health/ready', '/docs', '/docs-json'],
    });
    await app.listen(0, '127.0.0.1');
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    delivery = app.get(PromotionDeliveryService);
    actions = app.get(BoostActions);
    refunds = app.get(PromotionRefundsService);
    counters = app.get(CounterAggregator);
  });

  afterAll(async () => {
    await prisma.appConfig.deleteMany({ where: { key: KEY } });
    await app.close();
  });

  const api = () => request(baseUrl);

  async function setSettings(patch: Record<string, unknown>) {
    await prisma.appConfig.upsert({
      where: { key: KEY },
      create: { key: KEY, value: patch as never },
      update: { value: patch as never },
    });
    delivery.invalidate();
    actions.invalidate();
  }

  /** The default matrix with [edit] applied. */
  const pricing = (edit: (m: typeof DEFAULT_PRICING) => void) => {
    const m = JSON.parse(
      JSON.stringify(DEFAULT_PRICING),
    ) as typeof DEFAULT_PRICING;
    edit(m);
    return m;
  };

  async function user(role: 'client' | 'attorney') {
    const u = await prisma.user.create({ data: { role } });
    if (role === 'attorney') {
      const username = `att_${u.id.slice(0, 8)}`;
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username,
          username_lower: username,
          languages: ['en'],
          verification_status: 'verified',
        },
      });
    }
    const token = tokens.signAccessToken({
      sub: u.id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${token}` } };
  }

  const post = (authorId: string) =>
    prisma.post.create({
      data: { author_id: authorId, title: 'Boost me', body: 'A useful post' },
    });

  const quote = async (u: { auth: Record<string, string> }, postId: string) =>
    (await api().get(`/api/v1/posts/${postId}/promotion`).set(u.auth)).body.data
      .quote as {
      enabled: boolean;
      billing: string;
      offers: { billing: string; priceCents: number }[];
    };

  const buy = (
    u: { auth: Record<string, string> },
    postId: string,
    body: Record<string, unknown> = {},
  ) =>
    api()
      .post(`/api/v1/posts/${postId}/promotions`)
      .set({ ...u.auth, 'Idempotency-Key': randomUUID() })
      .send({ days: 4, dailyBudgetCents: 500, ...body });

  it('with the defaults only views are offered; the owner switches the rest on', async () => {
    await setSettings({});
    const author = await user('attorney');
    const p = await post(author.id);
    const q0 = await quote(author, p.id);
    expect(q0.enabled).toBe(true);
    expect(q0.billing).toBe('impressions');
    expect(q0.offers.map((o) => o.billing)).toEqual(['impressions']);

    await setSettings({
      pricing: pricing((m) => {
        m.post.models.clicks = { enabled: true, priceCents: 25 };
      }),
    });
    const q1 = await quote(author, p.id);
    expect(q1.offers.map((o) => o.billing)).toEqual(['impressions', 'clicks']);
    // The app sends no choice: the first one on is used.
    expect(q1.billing).toBe('impressions');
  });

  it('a thing with every way to pay switched off cannot be boosted', async () => {
    await setSettings({
      pricing: pricing((m) => {
        m.post.models.impressions.enabled = false;
      }),
    });
    const author = await user('attorney');
    const p = await post(author.id);
    expect((await quote(author, p.id)).enabled).toBe(false);
    await buy(author, p.id).expect(403);
    await setSettings({});
  });

  it('a purchase freezes the way to pay, its price, the units and the actions', async () => {
    await setSettings({
      pricing: pricing((m) => {
        m.post.models.impressions.enabled = false;
        m.post.models.actions = { enabled: true, priceCents: 125 };
        m.post.actions = ['follow', 'save'];
      }),
    });
    const author = await user('attorney');
    const p = await post(author.id);
    const res = await buy(author, p.id);
    expect(res.status).toBe(201);
    const row = await prisma.casePromotion.findFirstOrThrow({
      where: { post_id: p.id },
    });
    // 4 days x $5 = $20 -> 2000 / 125 = 16 actions, frozen on the row.
    expect(row).toMatchObject({
      billing: 'actions',
      unit_price_cents: 125,
      target_units: 16,
      billed_actions: ['follow', 'save'],
      target_impressions: null,
    });
    expect(res.body.data.promotion).toMatchObject({
      billing: 'actions',
      targetUnits: 16,
      deliveredUnits: 0,
    });
    // A later price change never touches a boost already bought.
    await setSettings({});
    const again = await prisma.casePromotion.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(again.unit_price_cents).toBe(125);

    // A way to pay that is off cannot be asked for.
    await prisma.casePromotion.update({
      where: { id: row.id },
      data: { status: 'canceled' },
    });
    await buy(author, p.id, { billing: 'reach' }).expect(403);
  });

  it('taps finish the boost at the target and the unspent part goes back once', async () => {
    await setSettings({});
    const author = await user('attorney');
    const p = await post(author.id);
    const pay = await prisma.payment.create({
      data: {
        user_id: author.id,
        amount_cents: 1000,
        currency: 'usd',
        status: 'succeeded',
        paid_at: new Date(),
      },
    });
    const promo = await prisma.casePromotion.create({
      data: {
        target_type: 'post',
        post_id: p.id,
        user_id: author.id,
        days: 2,
        price_cents_per_day: 500,
        total_cents: 1000,
        status: 'active',
        starts_at: new Date(Date.now() - 3_600_000),
        ends_at: new Date(Date.now() + 86_400_000),
        payment_id: pay.id,
        billing: 'clicks',
        unit_price_cents: 100,
        target_units: 10,
      },
    });
    delivery.invalidate();
    // Three people tap; the 10-tap target is not reached.
    for (let i = 0; i < 3; i += 1) {
      const v = await user('client');
      await delivery.record(v.id, [promo.id]);
      expect(await delivery.click(v.id, promo.id)).toBe(true);
    }
    expect(
      (
        await prisma.casePromotion.findUniqueOrThrow({
          where: { id: promo.id },
        })
      ).status,
    ).toBe('active');
    // The owner's own tap is never counted.
    await delivery.record(author.id, [promo.id]);
    expect(await delivery.click(author.id, promo.id)).toBe(false);

    // The boost ends early (time over): 3 of 10 taps used -> 70 % back.
    await prisma.casePromotion.update({
      where: { id: promo.id },
      data: { ends_at: new Date(Date.now() - 1000) },
    });
    await delivery.finish(
      promo.id,
      { user_id: author.id, case_id: null, post_id: p.id },
      'time_over',
    );
    const done = await prisma.casePromotion.findUniqueOrThrow({
      where: { id: promo.id },
    });
    expect(done.status).toBe('finished');
    expect(done.refunded_cents).toBe(700);
    const back = await prisma.refund.findMany({
      where: { payment_id: pay.id },
    });
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({
      amount_cents: 700,
      admin_id: null,
      status: 'succeeded',
    });
    // Processing the end again refunds nothing more.
    expect(await refunds.refundUnspent(promo.id)).toBe(0);
    expect(await prisma.refund.count({ where: { payment_id: pay.id } })).toBe(
      1,
    );
  });

  it('the target reached by taps finishes the boost with nothing to refund', async () => {
    await setSettings({});
    const author = await user('attorney');
    const p = await post(author.id);
    const promo = await prisma.casePromotion.create({
      data: {
        target_type: 'post',
        post_id: p.id,
        user_id: author.id,
        days: 1,
        price_cents_per_day: 300,
        total_cents: 300,
        status: 'active',
        starts_at: new Date(Date.now() - 3_600_000),
        ends_at: new Date(Date.now() + 86_400_000),
        billing: 'clicks',
        unit_price_cents: 100,
        target_units: 2,
      },
    });
    for (let i = 0; i < 2; i += 1) {
      const v = await user('client');
      await delivery.record(v.id, [promo.id]);
      await delivery.click(v.id, promo.id);
    }
    const done = await prisma.casePromotion.findUniqueOrThrow({
      where: { id: promo.id },
    });
    expect(done).toMatchObject({
      status: 'finished',
      cancel_reason: 'budget_spent',
      refunded_cents: 0,
    });
  });

  it('a real action counts once, for a person who was shown it, never for the owner', async () => {
    await setSettings({});
    const author = await user('attorney');
    const seen = await user('client');
    const stranger = await user('client');
    const p = await post(author.id);
    const promo = await prisma.casePromotion.create({
      data: {
        target_type: 'post',
        post_id: p.id,
        user_id: author.id,
        days: 3,
        price_cents_per_day: 500,
        total_cents: 1500,
        status: 'active',
        starts_at: new Date(Date.now() - 3_600_000),
        ends_at: new Date(Date.now() + 86_400_000),
        billing: 'actions',
        unit_price_cents: 500,
        target_units: 3,
        billed_actions: ['follow', 'save'],
      },
    });
    delivery.invalidate();
    actions.invalidate();
    await delivery.record(seen.id, [promo.id]);

    // Not shown -> not counted. The owner's own follow -> not counted.
    expect(await actions.record(stranger.id, { postId: p.id }, 'save')).toBe(0);
    expect(await actions.record(author.id, { postId: p.id }, 'save')).toBe(0);
    // A kind the buyer did not pay for -> not counted.
    expect(await actions.record(seen.id, { postId: p.id }, 'message')).toBe(0);
    // Counted once; the same person's second action is not.
    expect(await actions.record(seen.id, { postId: p.id }, 'save')).toBe(1);
    expect(
      await actions.record(seen.id, { ownerId: author.id }, 'follow'),
    ).toBe(0);
    const row = await prisma.casePromotion.findUniqueOrThrow({
      where: { id: promo.id },
    });
    // The count waits in the counter aggregator until the next flush.
    const waiting = await counters.pending('case_promotion', 'actions', [
      promo.id,
    ]);
    expect(row.actions + (waiting.get(promo.id) ?? 0)).toBe(1);
    expect(row.status).toBe('active');
  });

  it('the real follow flow reports the action', async () => {
    await setSettings({});
    const author = await user('attorney');
    const seen = await user('client');
    const p = await post(author.id);
    const promo = await prisma.casePromotion.create({
      data: {
        target_type: 'post',
        post_id: p.id,
        user_id: author.id,
        days: 3,
        price_cents_per_day: 500,
        total_cents: 1500,
        status: 'active',
        starts_at: new Date(Date.now() - 3_600_000),
        ends_at: new Date(Date.now() + 86_400_000),
        billing: 'actions',
        unit_price_cents: 500,
        target_units: 3,
        billed_actions: ['follow'],
      },
    });
    delivery.invalidate();
    actions.invalidate();
    await delivery.record(seen.id, [promo.id]);
    await api()
      .post(`/api/v1/attorneys/${author.id}/follow`)
      .set(seen.auth)
      .expect((r) => expect([200, 201, 204]).toContain(r.status));
    // The report is fire-and-forget: wait until it is written.
    let counted = 0;
    for (let i = 0; i < 40 && counted === 0; i += 1) {
      const r = await prisma.casePromotion.findUniqueOrThrow({
        where: { id: promo.id },
      });
      const waiting = await counters.pending('case_promotion', 'actions', [
        promo.id,
      ]);
      counted = r.actions + (waiting.get(promo.id) ?? 0);
      if (counted === 0) await new Promise((r) => setTimeout(r, 250));
    }
    expect(counted).toBe(1);
  });
});
