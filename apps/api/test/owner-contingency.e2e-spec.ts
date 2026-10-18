import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

/**
 * Owner 2026-10-17 (OQ-053): a percent (contingency) budget on a case and a
 * percent bid, negotiated in percent; hidden for family/criminal topics
 * (admin list) and capped by the admin's max percent.
 */
jest.setTimeout(120_000);

describe('Percent budgets and bids (e2e, OQ-053)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';
  let leafId = '';
  let familyLeafId = '';

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
    baseUrl = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    await prisma.state.upsert({
      where: { code: 'NY' },
      create: { code: 'NY', name: 'New York' },
      update: {},
    });
    const cat = await prisma.practiceArea.upsert({
      where: { code: 'e2e_ct_cat' },
      create: {
        code: 'e2e_ct_cat',
        name_en: 'Percent cat',
        i18n_key: 'practice.e2e_ct_cat',
        sort: 1,
      },
      update: {},
    });
    const leaf = await prisma.practiceArea.upsert({
      where: { code: 'e2e_ct_cat.leaf' },
      create: {
        code: 'e2e_ct_cat.leaf',
        parent_id: cat.id,
        name_en: 'Percent leaf',
        i18n_key: 'practice.e2e_ct_cat.leaf',
        sort: 1,
      },
      update: {},
    });
    leafId = leaf.id;
    const family = await prisma.practiceArea.upsert({
      where: { code: 'family_law' },
      create: {
        code: 'family_law',
        name_en: 'Family Law',
        i18n_key: 'practice.family_law',
        sort: 7,
      },
      update: {},
    });
    const divorce = await prisma.practiceArea.upsert({
      where: { code: 'family_law.e2e_ct_divorce' },
      create: {
        code: 'family_law.e2e_ct_divorce',
        parent_id: family.id,
        name_en: 'Divorce (e2e)',
        i18n_key: 'practice.family_law.e2e_ct_divorce',
        sort: 99,
      },
      update: {},
    });
    familyLeafId = divorce.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(baseUrl);

  function auth(id: string, role: 'client' | 'attorney') {
    const t = tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: role === 'attorney' ? 'active' : 'none',
    });
    return { Authorization: `Bearer ${t}` };
  }

  async function client() {
    const now = new Date();
    const u = await prisma.user.create({
      data: {
        role: 'client',
        first_name: 'Anna',
        last_name: 'Kowalski',
        phone_verified_at: now,
        email_verified_at: now,
      },
    });
    await prisma.onboardingState.create({
      data: { user_id: u.id, completed_at: now },
    });
    return { id: u.id, auth: auth(u.id, 'client') };
  }

  async function attorney() {
    const u = await prisma.user.create({ data: { role: 'attorney' } });
    const handle = `att${randomUUID().slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username: handle,
        username_lower: handle,
        verification_status: 'verified',
      },
    });
    await prisma.attorneyLicense.create({
      data: {
        attorney_id: u.id,
        state_code: 'NY',
        bar_number: `NY-${randomUUID()}`,
        license_status: 'verified',
      },
    });
    await prisma.attorneyPracticeArea.create({
      data: { attorney_id: u.id, practice_area_id: leafId },
    });
    await prisma.subscription.create({
      data: { user_id: u.id, status: 'active', price_cents: 39900 },
    });
    return { id: u.id, auth: auth(u.id, 'attorney') };
  }

  const newCase = (
    cli: { auth: Record<string, string> },
    extra: Record<string, unknown>,
    practiceAreaId = leafId,
  ) =>
    api()
      .post('/api/v1/cases')
      .set(cli.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        practiceAreaId,
        title: 'Truck crash on the highway, need help',
        description:
          'A truck hit my car on the highway last month and the insurer refuses to pay for my injuries.',
        primaryStateCode: 'NY',
        clientContactSharingConsent: true,
        ...extra,
      });

  it('a percent budget, a percent bid and a percent counter-offer', async () => {
    const cli = await client();
    const att = await attorney();
    const created = await newCase(cli, {
      budgetMode: 'percent',
      budgetPercentBps: 3300,
    }).expect(201);
    expect(created.body.data).toMatchObject({
      budgetMode: 'percent',
      budgetCents: null,
      budgetPercentBps: 3300,
    });
    const caseId = created.body.data.id as string;
    // percent mode needs the percent.
    await newCase(cli, { budgetMode: 'percent' }).expect(400);

    const bid = await api()
      .post(`/api/v1/cases/${caseId}/bids`)
      .set(att.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        feeType: 'contingency',
        percentBps: 3333,
        message: 'I work on contingency: no win, no fee for you.',
        startAvailability: 'immediately',
      })
      .expect(201);
    expect(bid.body.data).toMatchObject({
      feeType: 'contingency',
      amountCents: 0,
      percentBps: 3333,
    });
    const bidId = bid.body.data.id as string;

    const counter = await api()
      .post(`/api/v1/bids/${bidId}/counter`)
      .set(cli.auth)
      .send({ percentBps: 2500, message: 'Would you do 25%?' })
      .expect(201);
    expect(counter.body.data.percentBps).toBe(2500);
    expect(counter.body.data.offers[1]).toMatchObject({
      fromRole: 'client',
      feeType: 'contingency',
      percentBps: 2500,
    });
    // A dollar amount alone is not a counter to a percent bid.
    await api()
      .post(`/api/v1/bids/${bidId}/counter`)
      .set(att.auth)
      .send({ amountCents: 50_000 })
      .expect(400);
  });

  it('no percent for family/criminal topics; the admin cap applies', async () => {
    const cli = await client();
    const blocked = await newCase(
      cli,
      { budgetMode: 'percent', budgetPercentBps: 3000 },
      familyLeafId,
    );
    expect(blocked.status).toBe(400);
    expect(blocked.body.error.code).toBe('CONTINGENCY_NOT_ALLOWED');

    const fam = await newCase(
      cli,
      { budgetMode: 'clarify_later' },
      familyLeafId,
    ).expect(201);
    const att = await attorney();
    const noBid = await api()
      .post(`/api/v1/cases/${fam.body.data.id}/bids`)
      .set(att.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        feeType: 'contingency',
        percentBps: 3000,
        message: 'I can take this matter on a contingency basis.',
        startAvailability: 'immediately',
      });
    expect(noBid.status).toBe(400);
    expect(noBid.body.error.code).toBe('CONTINGENCY_NOT_ALLOWED');

    await prisma.appConfig.upsert({
      where: { key: 'fees.contingency_max_percent' },
      create: { key: 'fees.contingency_max_percent', value: 40 },
      update: { value: 40 },
    });
    const redis = app.get<Redis>(REDIS_CLIENT);
    await redis.del('config:app_config');
    try {
      const capped = await newCase(cli, {
        budgetMode: 'percent',
        budgetPercentBps: 4500,
      });
      expect(capped.status).toBe(400);
    } finally {
      await prisma.appConfig.delete({
        where: { key: 'fees.contingency_max_percent' },
      });
      await redis.del('config:app_config');
    }
  });
});
