import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/** Owner 2026-10-18: the cases budget filter has «Проценты»; options are OR-ed. */
jest.setTimeout(180_000);

describe('Percent budget filter (e2e)', () => {
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
      where: { code: 'e2e_pbf_cat' },
      create: {
        code: 'e2e_pbf_cat',
        name_en: 'Stale cat',
        i18n_key: 'practice.e2e_pbf_cat',
        sort: 1,
      },
      update: {},
    });
    const leaf = await prisma.practiceArea.upsert({
      where: { code: 'e2e_pbf_cat.leaf' },
      create: {
        code: 'e2e_pbf_cat.leaf',
        parent_id: cat.id,
        name_en: 'Stale leaf',
        i18n_key: 'practice.e2e_pbf_cat.leaf',
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

  async function mk(
    cli: { id: string },
    data: Record<string, unknown>,
  ): Promise<string> {
    const c = await prisma.case.create({
      data: {
        client_id: cli.id,
        title: 'Budget filter case title',
        description: 'A case used to check the budget filter options.',
        practice_area_id: leafId,
        primary_state_code: 'NY',
        status: 'open',
        ...data,
      } as never,
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'NY', is_primary: true },
    });
    return c.id;
  }

  it('percent alone, percent up to N, and percent OR a range OR clarify later', async () => {
    const cli = await client();
    const att = await attorney();
    const pct20 = await mk(cli, {
      budget_mode: 'percent',
      budget_percent_bps: 2000,
    });
    const pct40 = await mk(cli, {
      budget_mode: 'percent',
      budget_percent_bps: 4000,
    });
    const amt = await mk(cli, { budget_mode: 'amount', budget_cents: 500_000 });
    const far = await mk(cli, {
      budget_mode: 'amount',
      budget_cents: 9_000_000,
    });
    const later = await mk(cli, { budget_mode: 'clarify_later' });

    const ids = async (path: string, q: Record<string, unknown>) => {
      const r = await api()
        .get(path)
        .query(path.includes('search') ? { q: 'budget', ...q } : q)
        .set(att.auth);
      expect(r.status).toBe(200);
      return (r.body.data as { id: string }[]).map((c) => c.id);
    };
    for (const path of ['/api/v1/cases', '/api/v1/search/cases']) {
      const only = await ids(path, { budgetPercent: true });
      expect(only).toEqual(expect.arrayContaining([pct20, pct40]));
      for (const x of [amt, far, later]) expect(only).not.toContain(x);

      const upTo = await ids(path, { budgetPercent: true, percentMax: 25 });
      expect(upTo).toContain(pct20);
      expect(upTo).not.toContain(pct40);

      const orRange = await ids(path, {
        budgetPercent: true,
        budgetMin: 1000,
        budgetMax: 10_000,
      });
      expect(orRange).toEqual(expect.arrayContaining([pct20, pct40, amt]));
      expect(orRange).not.toContain(far);
      expect(orRange).not.toContain(later);

      const all = await ids(path, {
        budgetPercent: true,
        budgetUnknown: true,
        budgetMax: 10_000,
      });
      expect(all).toEqual(expect.arrayContaining([pct20, pct40, amt, later]));
      expect(all).not.toContain(far);

      // Without percent the old behaviour: a range excludes percent cases.
      const range = await ids(path, { budgetMin: 1000, budgetMax: 10_000 });
      expect(range).toContain(amt);
      expect(range).not.toContain(pct20);
    }
  });
});
