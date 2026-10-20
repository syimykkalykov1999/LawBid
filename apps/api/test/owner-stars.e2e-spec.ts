import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { adminSession } from './support/admin-login';
import { PAYMENT_PROVIDER } from '../src/modules/billing/billing.constants';
import type { FakePaymentProvider } from '../src/modules/billing/fake-payment.provider';
import { StarsService } from '../src/modules/stars/stars.service';

/**
 * Owner 2026-10-20 — stars: bought on the web (checkout), gifts in a chat
 * and on a profile, a gift turned into stars, a paid sticker pack. The
 * balance never goes below zero and no event is applied twice.
 */
jest.setTimeout(120_000);

describe('Stars, gifts and paid stickers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';
  let fake: FakePaymentProvider;

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
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    fake = app.get<FakePaymentProvider>(PAYMENT_PROVIDER);
  });

  afterAll(async () => {
    await prisma.featureFlag.deleteMany({ where: { key: 'stars' } });
    await app.close();
  });

  const api = () => request(base);
  const bearer = (id: string, role: 'client' | 'attorney') => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });
  const flag = (enabled: boolean) =>
    prisma.featureFlag.upsert({
      where: { key: 'stars' },
      create: { key: 'stars', enabled },
      update: { enabled },
    });

  async function user(role: 'client' | 'attorney', name: string) {
    const u = await prisma.user.create({
      data: { role, first_name: name, last_name: 'Stars' },
    });
    return { id: u.id, auth: bearer(u.id, role) };
  }

  async function stickerFile(owner: string) {
    return prisma.file.create({
      data: {
        owner_user_id: owner,
        purpose: 'sticker',
        s3_bucket: 'media',
        s3_key: `e2e/${randomUUID()}.webp`,
        mime: 'image/webp',
        size_bytes: 1000n,
        sha256: randomUUID().replace(/-/g, '').padEnd(64, '0'),
        scan_status: 'clean',
        is_public: true,
      },
    });
  }

  async function gift(owner: string, price: number, title = 'Rose') {
    const f = await stickerFile(owner);
    return prisma.gift.create({
      data: { title, price_stars: price, file_id: f.id },
    });
  }

  async function buy(auth: Record<string, string>) {
    const bought = await api()
      .post('/api/v1/stars/packs/stars_50/buy')
      .set(auth)
      .expect(200);
    return bought.body.data as { purchaseId: string; checkoutUrl: string };
  }

  async function chat(client: string, attorney: string) {
    const conv = await prisma.conversation.create({
      data: {
        client_id: client,
        attorney_id: attorney,
        status: 'active',
        contacts_unlocked: true,
        pair_kind: 'attorney_client',
        participants: { create: [{ user_id: client }, { user_id: attorney }] },
      },
    });
    return conv.id;
  }

  it('is off by default: no packs, buying refused', async () => {
    await flag(false);
    const u = await user('client', 'Off');
    const o = await api().get('/api/v1/stars').set(u.auth).expect(200);
    expect(o.body.data).toMatchObject({
      enabled: false,
      balance: 0,
      packs: [],
    });
    await api()
      .post('/api/v1/stars/packs/stars_50/buy')
      .set(u.auth)
      .expect(409);
  });

  it('a paid checkout credits the stars once; a replay changes nothing', async () => {
    await flag(true);
    const u = await user('client', 'Buyer');
    const { purchaseId, checkoutUrl } = await buy(u.auth);
    expect(checkoutUrl).toContain('http');
    const before = await api()
      .get(`/api/v1/stars/purchases/${purchaseId}`)
      .set(u.auth)
      .expect(200);
    expect(before.body.data.status).toBe('pending_payment');

    const row = await prisma.starPurchase.findUniqueOrThrow({
      where: { id: purchaseId },
    });
    // pay on the (fake) hosted page, and replay the webhook
    const session = row.stripe_checkout_id!;
    await fake.payCheckout(session);
    const paid = (await fake.retrieveCheckoutSession(session))!;
    await app.get(StarsService).applyCheckout(paid);
    await app.get(StarsService).applyCheckout(paid);
    const after = await api()
      .get(`/api/v1/stars/purchases/${purchaseId}`)
      .set(u.auth)
      .expect(200);
    expect(after.body.data).toMatchObject({ status: 'paid', stars: row.stars });
    expect(after.body.data.balance).toBe(row.stars);
    const ledger = await prisma.starLedger.findMany({
      where: { user_id: u.id },
    });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ kind: 'topup', delta: row.stars });
  });

  it('a webhook that beats the session id still credits; a refund takes stars back, the rest becomes a debt', async () => {
    await flag(true);
    const stars = app.get(StarsService);
    const u = await user('client', 'Refunded');
    const { purchaseId } = await buy(u.auth);
    const row = await prisma.starPurchase.findUniqueOrThrow({
      where: { id: purchaseId },
    });
    const session = row.stripe_checkout_id!;
    // the webhook came before the id was written
    await prisma.starPurchase.update({
      where: { id: purchaseId },
      data: { stripe_checkout_id: null },
    });
    await fake.payCheckout(session);
    const paid = (await fake.retrieveCheckoutSession(session))!;
    expect(await stars.applyCheckout(paid)).toBe(true);
    const bought = await prisma.starPurchase.findUniqueOrThrow({
      where: { id: purchaseId },
    });
    expect(bought).toMatchObject({
      status: 'paid',
      stripe_checkout_id: session,
    });

    // 20 stars are left, the rest was spent; Stripe refunds the payment
    await prisma.starWallet.update({
      where: { user_id: u.id },
      data: { balance: 20 },
    });
    expect(await stars.refundPayments([bought.payment_id!])).toBe(1);
    expect(await stars.refundPayments([bought.payment_id!])).toBe(0);
    const w = await prisma.starWallet.findUniqueOrThrow({
      where: { user_id: u.id },
    });
    expect(w).toMatchObject({ balance: 0, debt: row.stars - 20 });
    const refund = await prisma.starLedger.findMany({
      where: { user_id: u.id, kind: 'refund' },
    });
    expect(refund).toHaveLength(1);
    expect(refund[0]).toMatchObject({ delta: -20, balance_after: 0 });
    expect((await stars.debts()).find((d) => d.userId === u.id)?.debt).toBe(
      row.stars - 20,
    );

    // a later credit pays the debt first
    await prisma.$transaction((tx) =>
      stars.credit(tx, u.id, row.stars, 'admin_grant', `t:${randomUUID()}`),
    );
    expect(
      await prisma.starWallet.findUniqueOrThrow({ where: { user_id: u.id } }),
    ).toMatchObject({ balance: 20, debt: 0 });
  });

  it('a gift in a chat charges the giver, shows in the bubble, never overdraws', async () => {
    await flag(true);
    const client = await user('client', 'Giver');
    const attorney = await user('attorney', 'Receiver');
    const convId = await chat(client.id, attorney.id);
    const g = await gift(client.id, 30);

    const poor = await api()
      .post(`/api/v1/conversations/${convId}/messages`)
      .set(client.auth)
      .send({ clientMessageId: randomUUID(), type: 'gift', giftId: g.id })
      .expect(402);
    expect(poor.body.error.code).toBe('INSUFFICIENT_STARS');

    await prisma.starWallet.create({
      data: { user_id: client.id, balance: 50, lifetime_bought: 50 },
    });
    const cmid = randomUUID();
    const sent = await api()
      .post(`/api/v1/conversations/${convId}/messages`)
      .set(client.auth)
      .send({
        clientMessageId: cmid,
        type: 'gift',
        giftId: g.id,
        body: 'Thanks!',
      })
      .expect(201);
    expect(sent.body.data.type).toBe('gift');
    expect(sent.body.data.gift).toMatchObject({
      note: 'Thanks!',
      senderId: null,
    });
    expect(sent.body.data.gift.gift.priceStars).toBe(30);

    // the same clientMessageId again: same message, no second charge
    await api()
      .post(`/api/v1/conversations/${convId}/messages`)
      .set(client.auth)
      .send({ clientMessageId: cmid, type: 'gift', giftId: g.id })
      .expect(201);
    const w = await prisma.starWallet.findUniqueOrThrow({
      where: { user_id: client.id },
    });
    expect(w.balance).toBe(20);

    // 20 left < 30: refused, balance untouched
    await api()
      .post(`/api/v1/conversations/${convId}/messages`)
      .set(client.auth)
      .send({ clientMessageId: randomUUID(), type: 'gift', giftId: g.id })
      .expect(402);
    expect(
      (
        await prisma.starWallet.findUniqueOrThrow({
          where: { user_id: client.id },
        })
      ).balance,
    ).toBe(20);
    expect(
      await prisma.giftSend.count({ where: { sender_id: client.id } }),
    ).toBe(1);

    // the receiver: shows it, hides it, turns it into stars (70 % of 30 = 21)
    const mine = await api()
      .get(`/api/v1/stars/users/${attorney.id}/gifts`)
      .set(attorney.auth)
      .expect(200);
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0].senderName).toBe('Giver Stars');
    const sid = mine.body.data[0].id as string;
    await api()
      .patch(`/api/v1/stars/received-gifts/${sid}`)
      .set(attorney.auth)
      .send({ shown: false })
      .expect(204);
    const others = await api()
      .get(`/api/v1/stars/users/${attorney.id}/gifts`)
      .set(client.auth)
      .expect(200);
    expect(others.body.data).toHaveLength(0);
    const conv = await api()
      .post(`/api/v1/stars/received-gifts/${sid}/convert`)
      .set(attorney.auth)
      .expect(200);
    expect(conv.body.data).toMatchObject({ stars: 21, balance: 21 });
    await api()
      .post(`/api/v1/stars/received-gifts/${sid}/convert`)
      .set(attorney.auth)
      .expect(409);
  });

  it('a gift to a profile notifies; yourself and a blocked user are refused', async () => {
    await flag(true);
    const a = await user('client', 'Alpha');
    const b = await user('attorney', 'Beta');
    const g = await gift(a.id, 10);
    await prisma.starWallet.create({
      data: { user_id: a.id, balance: 25, lifetime_bought: 25 },
    });
    await api()
      .post(`/api/v1/stars/gifts/${g.id}/send`)
      .set(a.auth)
      .send({ recipientId: a.id })
      .expect(400);
    const ok = await api()
      .post(`/api/v1/stars/gifts/${g.id}/send`)
      .set(a.auth)
      .send({ recipientId: b.id, anonymous: true })
      .expect(200);
    expect(ok.body.data.gift.priceStars).toBe(10);
    const seen = await api()
      .get(`/api/v1/stars/users/${b.id}/gifts`)
      .set(b.auth)
      .expect(200);
    expect(seen.body.data[0].senderName).toBeNull();
    expect(
      await prisma.notification.count({
        where: { user_id: b.id, type: 'gift_received' },
      }),
    ).toBe(1);
    await prisma.userBlock.create({
      data: { blocker_id: b.id, blocked_id: a.id },
    });
    await api()
      .post(`/api/v1/stars/gifts/${g.id}/send`)
      .set(a.auth)
      .send({ recipientId: b.id })
      .expect(403);
  });

  it('a gift to a profile is refused (403, nothing charged) when the person does not accept messages from the giver', async () => {
    await flag(true);
    const a = await user('client', 'Gamma');
    const b = await user('attorney', 'Delta');
    const g = await gift(a.id, 10);
    await prisma.starWallet.create({
      data: { user_id: a.id, balance: 25, lifetime_bought: 25 },
    });
    await api()
      .put('/api/v1/users/me/privacy')
      .set(b.auth)
      .send({ messageFrom: 'nobody' })
      .expect(200);
    const res = await api()
      .post(`/api/v1/stars/gifts/${g.id}/send`)
      .set(a.auth)
      .send({ recipientId: b.id })
      .expect(403);
    expect(res.body.error?.code ?? res.body.code).toBe('PRIVACY_RESTRICTED');
    const w = await prisma.starWallet.findUnique({ where: { user_id: a.id } });
    expect(w?.balance).toBe(25);
    expect(await prisma.giftSend.count({ where: { sender_id: a.id } })).toBe(0);
  });

  it('a paid sticker pack is charged once, free to add again, sent only when added', async () => {
    await flag(true);
    const u = await user('client', 'Sticky');
    const other = await user('attorney', 'Mate');
    const convId = await chat(u.id, other.id);
    const f = await stickerFile(u.id);
    const pack = await prisma.stickerPack.create({
      data: {
        title: 'Pro',
        short_name: `pro${randomUUID().slice(0, 8)}`,
        is_official: true,
        price_stars: 40,
        sticker_count: 1,
        stickers: { create: { file_id: f.id, emoji: '🔥' } },
      },
      include: { stickers: true },
    });
    const sticker = pack.stickers[0];
    // not added: refused
    const no = await api()
      .post(`/api/v1/conversations/${convId}/messages`)
      .set(u.auth)
      .send({
        clientMessageId: randomUUID(),
        type: 'sticker',
        stickerId: sticker.id,
      })
      .expect(403);
    expect(no.body.error.code).toBe('STICKER_PACK_NOT_OWNED');
    // no stars: 402
    await api()
      .post(`/api/v1/stickers/packs/${pack.id}/install`)
      .set(u.auth)
      .expect(402);
    expect(
      await prisma.userStickerPack.count({ where: { user_id: u.id } }),
    ).toBe(0);

    await prisma.starWallet.create({
      data: { user_id: u.id, balance: 100, lifetime_bought: 100 },
    });
    const inst = await api()
      .post(`/api/v1/stickers/packs/${pack.id}/install`)
      .set(u.auth)
      .expect(201);
    expect(inst.body.data).toMatchObject({ installed: true, priceStars: 40 });
    await api()
      .delete(`/api/v1/stickers/packs/${pack.id}/install`)
      .set(u.auth)
      .expect(204);
    await api()
      .post(`/api/v1/stickers/packs/${pack.id}/install`)
      .set(u.auth)
      .expect(201);
    expect(
      (await prisma.starWallet.findUniqueOrThrow({ where: { user_id: u.id } }))
        .balance,
    ).toBe(60);
    await api()
      .post(`/api/v1/conversations/${convId}/messages`)
      .set(u.auth)
      .send({
        clientMessageId: randomUUID(),
        type: 'sticker',
        stickerId: sticker.id,
      })
      .expect(201);
  });

  it('Boost paid with stars: charged once, started, refunded on an admin cancel; a premium reaction is charged once', async () => {
    await flag(true);
    const stars = app.get(StarsService);
    const admin = await adminSession(base, prisma, 'super_admin');
    const u = await user('client', 'Booster');
    const p = await prisma.post.create({
      data: { author_id: u.id, title: 'Boost me', body: 'A useful post' },
    });
    const poor = await user('client', 'Poor');
    const pp = await prisma.post.create({
      data: { author_id: poor.id, title: 'Boost me', body: 'A useful post' },
    });
    await prisma.$transaction((tx) =>
      stars.credit(tx, u.id, 100000, 'admin_grant', `t:${randomUUID()}`),
    );

    const st = await api()
      .get(`/api/v1/posts/${p.id}/promotion`)
      .set(u.auth)
      .expect(200);
    expect(st.body.data.quote.starsTotal).toBeGreaterThan(0);

    // not enough stars: refused, nothing is created
    await api()
      .post(`/api/v1/posts/${pp.id}/promotions`)
      .set({ ...poor.auth, 'Idempotency-Key': randomUUID() })
      .send({ days: 3, dailyBudgetCents: 500, payWith: 'stars' })
      .expect(402);
    expect(
      await prisma.casePromotion.count({ where: { post_id: pp.id } }),
    ).toBe(0);

    const made = await api()
      .post(`/api/v1/posts/${p.id}/promotions`)
      .set({ ...u.auth, 'Idempotency-Key': randomUUID() })
      .send({ days: 3, dailyBudgetCents: 500, payWith: 'stars' })
      .expect(201);
    const d = made.body.data;
    expect(d.checkoutUrl).toBeNull();
    expect(d.starsCharged).toBeGreaterThan(0);
    expect(['active', 'pending_review']).toContain(d.status);
    const w = await prisma.starWallet.findUniqueOrThrow({
      where: { user_id: u.id },
    });
    expect(w.balance).toBe(100000 - d.starsCharged);
    expect(
      await prisma.starLedger.count({
        where: { user_id: u.id, kind: 'boost' },
      }),
    ).toBe(1);

    // an admin cancels and returns everything
    await api()
      .post(`/api/v1/admin/promotions/${d.promotionId}/cancel`)
      .set(admin.auth)
      .send({ reason: 'test', refund: 'full' })
      .expect(200);
    expect(
      (await prisma.starWallet.findUniqueOrThrow({ where: { user_id: u.id } }))
        .balance,
    ).toBe(100000);

    // premium reaction: free emoji costs nothing, a premium one once
    const msg = randomUUID();
    const prem = (await stars.adminSettings()).premiumReactions[0];
    const charge = (emoji: string) =>
      prisma.$transaction((tx) => stars.chargeReaction(tx, u.id, msg, emoji));
    expect(await charge('👍')).toBe(0);
    const price = await charge(prem);
    expect(price).toBeGreaterThan(0);
    expect(await charge(prem)).toBe(0);
    expect(
      await prisma.starLedger.count({
        where: { user_id: u.id, kind: 'reaction' },
      }),
    ).toBe(1);
  });

  it('admin: packs, gifts, report, grant; the others are refused', async () => {
    await flag(true);
    const admin = await adminSession(base, prisma, 'super_admin');
    const mod = await adminSession(base, prisma, 'moderator');
    await api().get('/api/v1/admin/stars/settings').set(mod.auth).expect(404);
    const s = await api()
      .put('/api/v1/admin/stars/settings')
      .set(admin.auth)
      .send({
        packs: [{ id: 'stars_50', stars: 50, priceCents: 99 }],
        giftConvertPercent: 70,
        giftsPerDayMax: 100,
      })
      .expect(200);
    expect(s.body.data.packs).toHaveLength(1);
    await api()
      .put('/api/v1/admin/stars/settings')
      .set(admin.auth)
      .send({
        packs: [
          { id: 'a_1', stars: 1, priceCents: 100 },
          { id: 'a_1', stars: 2, priceCents: 200 },
        ],
        giftConvertPercent: 70,
        giftsPerDayMax: 100,
      })
      .expect(400);
    const u = await user('client', 'Granted');
    const g = await api()
      .post('/api/v1/admin/stars/grant')
      .set(admin.auth)
      .send({ userId: u.id, amount: 15, reason: 'e2e present' })
      .expect(200);
    expect(g.body.data.balance).toBe(15);
    await api()
      .post('/api/v1/admin/stars/grant')
      .set(admin.auth)
      .send({ userId: u.id, amount: -99, reason: 'too much' })
      .expect(402);
    const r = await api()
      .get('/api/v1/admin/stars/report?days=30')
      .set(admin.auth)
      .expect(200);
    expect(r.body.data.outstandingStars).toBeGreaterThanOrEqual(15);
    const led = await api()
      .get(`/api/v1/admin/stars/ledger?userId=${u.id}`)
      .set(admin.auth)
      .expect(200);
    expect(led.body.data).toHaveLength(1);
  });
});
