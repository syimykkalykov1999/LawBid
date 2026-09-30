import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner decision 2026-09-30 (docs/OPEN_QUESTIONS.md OQ-036): each Search
 * tab has its own filters — People (role, verified), Cases (budget,
 * "clarify later", no bids yet, practice category).
 */
jest.setTimeout(120_000);

describe('Search filters per tab (e2e, OQ-036)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';
  let leafId = '';

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
      where: { code: 'e2e_sf_cat' },
      create: {
        code: 'e2e_sf_cat',
        name_en: 'Filters cat',
        i18n_key: 'practice.e2e_sf_cat',
        sort: 1,
      },
      update: {},
    });
    const leaf = await prisma.practiceArea.upsert({
      where: { code: 'e2e_sf_cat.leaf' },
      create: {
        code: 'e2e_sf_cat.leaf',
        parent_id: cat.id,
        name_en: 'Filters leaf',
        i18n_key: 'practice.e2e_sf_cat.leaf',
        sort: 1,
      },
      update: {},
    });
    leafId = leaf.id;
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

  it('case search: budget range, "clarify later" and "no bids yet"', async () => {
    const cli = await client();
    const tag = randomUUID().slice(0, 6);
    const mk = (extra: Record<string, unknown>) =>
      api()
        .post('/api/v1/cases')
        .set(cli.auth)
        .set('Idempotency-Key', randomUUID())
        .send({
          practiceAreaId: leafId,
          title: `Warehouse dispute ${tag} with landlord`,
          description:
            'The landlord of our warehouse keeps the deposit and refuses to repair the roof after the storm.',
          primaryStateCode: 'NY',
          clientContactSharingConsent: true,
          ...extra,
        });
    const priced = await mk({ budgetMode: 'amount', budgetAmountDollars: 900 });
    const open = await mk({ budgetMode: 'clarify_later' });
    expect(priced.status).toBe(201);
    expect(open.status).toBe(201);
    const att = await attorney();
    const ids = async (qs: string) =>
      (
        (
          await api()
            .get(`/api/v1/search/cases?q=warehouse ${tag}${qs}`)
            .set(att.auth)
        ).body.data as { id: string }[]
      ).map((x) => x.id);

    expect(await ids('&budgetUnknown=true')).toEqual([open.body.data.id]);
    expect(await ids('&budgetMin=500&budgetMax=1000')).toEqual([
      priced.body.data.id,
    ]);
    expect(await ids('&budgetMin=1000')).toEqual([]);
    expect((await ids('&noBids=true')).sort()).toEqual(
      [open.body.data.id, priced.body.data.id].sort(),
    );
    expect(
      await ids('&practiceCategory=e2e_sf_cat&budgetUnknown=true'),
    ).toEqual([open.body.data.id]);
  });

  it('people search: role and verified-only', async () => {
    const handle = `sf${randomUUID().slice(0, 6)}`;
    const now = new Date();
    const cu = await prisma.user.create({
      data: {
        role: 'client',
        first_name: 'Zed',
        last_name: 'Client',
        phone_verified_at: now,
      },
    });
    await prisma.clientProfile.create({
      data: {
        user_id: cu.id,
        state_code: 'NY',
        preferred_languages: ['en'],
        username: `${handle}c`,
        username_lower: `${handle}c`,
      },
    });
    const au = await prisma.user.create({ data: { role: 'attorney' } });
    await prisma.attorneyProfile.create({
      data: {
        user_id: au.id,
        username: `${handle}a`,
        username_lower: `${handle}a`,
        verification_status: 'unverified',
      },
    });
    const viewer = await client();
    const roles = async (qs: string) =>
      (
        (
          await api()
            .get(`/api/v1/search/people?q=${handle}${qs}`)
            .set(viewer.auth)
        ).body.data as { role: string }[]
      ).map((x) => x.role);

    expect((await roles('')).sort()).toEqual(['attorney', 'client']);
    expect(await roles('&role=client')).toEqual(['client']);
    expect(await roles('&role=attorney')).toEqual(['attorney']);
    // The unverified attorney drops out; the phone-verified client stays.
    expect(await roles('&verifiedOnly=true')).toEqual(['client']);
    expect(await roles('&state=NY&role=client')).toEqual(['client']);
  });
});
