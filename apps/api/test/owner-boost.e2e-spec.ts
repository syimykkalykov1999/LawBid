import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { PromotionDeliveryService } from '../src/modules/promotions/promotion-delivery.service';

/**
 * Owner 2026-10-15 (Boost, mockup v4), against real PostgreSQL/Redis:
 *  - the on/off flags: master, per role, per content type — the quote's
 *    `enabled` and the purchase follow them at once;
 *  - the button under an ad: allowed type, https link without shorteners or
 *    chat apps, a real phone — stored with the goal;
 *  - delivery: a promoted post is picked for another viewer (never its own
 *    author), counted by day, clicks counted, stats by day for the owner
 *    only; once the paid time is over it is not shown;
 *  - a boosted case is on top of the attorney's feed with its last paid day.
 */
jest.setTimeout(90_000);

describe('Boost (e2e, owner 2026-10-15)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let delivery: PromotionDeliveryService;
  let baseUrl = '';
  let practiceAreaId = '';
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
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey', is_active: true },
      update: {},
    });
    const area = await prisma.practiceArea.upsert({
      where: { code: 'e2e_boost_leaf' },
      create: {
        code: 'e2e_boost_leaf',
        name_en: 'E2E boost',
        i18n_key: 'practice.e2e_boost_leaf',
        sort: 1,
      },
      update: {},
    });
    practiceAreaId = area.id;
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
  }

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
      await prisma.subscription.create({
        data: { user_id: u.id, status: 'active', price_cents: 39900 },
      });
      await prisma.attorneyLicense.create({
        data: {
          attorney_id: u.id,
          state_code: 'NJ',
          bar_number: `NJ-${randomUUID()}`,
          license_status: 'verified',
        },
      });
      await prisma.attorneyPracticeArea.create({
        data: { attorney_id: u.id, practice_area_id: practiceAreaId },
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

  it('the switches: master, role and content type', async () => {
    const attorney = await user('attorney');
    const client = await user('client');
    const p = await post(attorney.id);
    const state = (auth: Record<string, string>) =>
      api().get(`/api/v1/posts/${p.id}/promotion`).set(auth);

    await setSettings({});
    expect((await state(attorney.auth)).body.data.quote.enabled).toBe(true);

    await setSettings({ boostEnabled: false });
    const off = await state(attorney.auth);
    expect(off.body.data.quote.enabled).toBe(false);
    expect(off.body.data.canPromote).toBe(false);
    await api()
      .post(`/api/v1/posts/${p.id}/promotions`)
      .set({ ...attorney.auth, 'Idempotency-Key': randomUUID() })
      .send({ days: 3, dailyBudgetCents: 500 })
      .expect(403);

    await setSettings({ attorneysEnabled: false });
    expect((await state(attorney.auth)).body.data.quote.enabled).toBe(false);
    const ownCase = await prisma.case.create({
      data: {
        client_id: client.id,
        title: 'A case to boost',
        description: 'Some description of the case.',
        practice_area_id: practiceAreaId,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    // The client is still allowed (own case).
    const cs = await api()
      .get(`/api/v1/cases/${ownCase.id}/promotion`)
      .set(client.auth);
    expect(cs.body.data.quote.enabled).toBe(true);

    await setSettings({ clientsEnabled: false });
    const cs2 = await api()
      .get(`/api/v1/cases/${ownCase.id}/promotion`)
      .set(client.auth);
    expect(cs2.body.data.quote.enabled).toBe(false);

    // The content type: cases off, posts still on.
    await setSettings({ enabled: false });
    const cs3 = await api()
      .get(`/api/v1/cases/${ownCase.id}/promotion`)
      .set(client.auth);
    expect(cs3.body.data.quote.enabled).toBe(false);
    expect((await state(attorney.auth)).body.data.quote.enabled).toBe(true);
    await setSettings({});
  });

  it('the button: allowed type, safe link, real phone — stored with the goal', async () => {
    await setSettings({});
    const attorney = await user('attorney');
    const p = await post(attorney.id);
    const buy = (body: Record<string, unknown>) =>
      api()
        .post(`/api/v1/posts/${p.id}/promotions`)
        .set({ ...attorney.auth, 'Idempotency-Key': randomUUID() })
        .send({ days: 3, dailyBudgetCents: 500, ...body });

    await buy({ ctaType: 'more', ctaValue: 'https://bit.ly/abc' }).expect(400);
    await buy({ ctaType: 'more', ctaValue: 'http://smith-law.com' }).expect(
      400,
    );
    await buy({ ctaType: 'more', ctaValue: 'https://wa.me/123' }).expect(400);
    await buy({ ctaType: 'call', ctaValue: '12345' }).expect(400);

    await setSettings({ ctaTypes: ['more'] });
    await buy({ ctaType: 'call', ctaValue: '+12025550123' }).expect(400);
    await setSettings({});

    const ok = await buy({
      goal: 'clicks',
      ctaType: 'more',
      ctaValue: 'https://smith-law.com/contact',
    });
    expect(ok.status).toBe(201);
    const row = await prisma.casePromotion.findFirstOrThrow({
      where: { post_id: p.id },
      orderBy: { created_at: 'desc' },
    });
    expect(row).toMatchObject({
      goal: 'clicks',
      cta_type: 'more',
      cta_value: 'https://smith-law.com/contact',
    });
  });

  it('delivery, stats by day, click, and the end of the paid time', async () => {
    await setSettings({});
    const author = await user('attorney');
    const viewer = await user('client');
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
        ends_at: new Date(Date.now() + 2 * 86_400_000),
        cta_type: 'profile',
      },
    });
    delivery.invalidate();

    const picked = await delivery.eligible('post', viewer.id);
    expect(picked.map((x) => x.id)).toContain(promo.id);
    // Never its own author.
    const own = await delivery.eligible('post', author.id);
    expect(own.map((x) => x.id)).not.toContain(promo.id);

    await delivery.record(viewer.id, [promo.id]);
    expect(await delivery.click(viewer.id, promo.id)).toBe(true);
    // One click per person.
    expect(await delivery.click(viewer.id, promo.id)).toBe(false);

    const stats = await api()
      .get(`/api/v1/promotions/${promo.id}/stats`)
      .set(author.auth)
      .expect(200);
    expect(stats.body.data.promotion).toMatchObject({
      impressions: 1,
      reach: 1,
      clicks: 1,
      ctaType: 'profile',
    });
    expect(stats.body.data.days).toEqual([
      expect.objectContaining({ impressions: 1, reach: 1, clicks: 1 }),
    ]);
    expect(stats.body.data.spentCents).toBeGreaterThanOrEqual(0);
    // Only the owner sees the numbers.
    await api()
      .get(`/api/v1/promotions/${promo.id}/stats`)
      .set(viewer.auth)
      .expect(404);

    // The paid time is over: not shown any more.
    await prisma.casePromotion.update({
      where: { id: promo.id },
      data: { ends_at: new Date(Date.now() - 1000) },
    });
    delivery.invalidate();
    const after = await delivery.eligible('post', viewer.id);
    expect(after.map((x) => x.id)).not.toContain(promo.id);
  });

  it('a boosted case is first in the attorney feed with its last paid day', async () => {
    await setSettings({});
    const client = await user('client');
    const attorney = await user('attorney');
    const mk = (title: string) =>
      prisma.case
        .create({
          data: {
            client_id: client.id,
            title,
            description: 'Some description of the case.',
            practice_area_id: practiceAreaId,
            primary_state_code: 'NJ',
            budget_mode: 'clarify_later',
            status: 'open',
          },
        })
        .then(async (c) => {
          await prisma.caseState.create({
            data: { case_id: c.id, state_code: 'NJ', is_primary: true },
          });
          return c;
        });
    const plain = await mk('Plain case');
    const boosted = await mk('Boosted case');
    const endsAt = new Date(Date.now() + 3 * 86_400_000);
    await prisma.casePromotion.create({
      data: {
        target_type: 'case',
        case_id: boosted.id,
        user_id: client.id,
        days: 3,
        price_cents_per_day: 500,
        total_cents: 1500,
        status: 'active',
        starts_at: new Date(Date.now() - 3_600_000),
        ends_at: endsAt,
      },
    });
    delivery.invalidate();
    const feed = await api().get('/api/v1/cases').set(attorney.auth);
    expect(feed.status).toBe(200);
    const items = feed.body.data as {
      id: string;
      promoted: boolean;
      promotedUntil?: string | null;
    }[];
    const ids = items.map((i) => i.id);
    expect(ids.indexOf(boosted.id)).toBeLessThan(ids.indexOf(plain.id));
    const top = items.find((i) => i.id === boosted.id)!;
    expect(top.promoted).toBe(true);
    expect(new Date(top.promotedUntil ?? 0).getTime()).toBe(endsAt.getTime());
    expect(items.find((i) => i.id === plain.id)!.promoted).toBe(false);
  });
});
