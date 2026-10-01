import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { ensurePostPractices } from './support/post-practices';

/**
 * Owner 2026-09-30: "Mine" — the client's tabs split into Open / In
 * progress, and every Mine list searches by title and filters by
 * qualification (with subcategories) and state; the attorney case feed
 * shows any qualification picked in the topic filter.
 */
jest.setTimeout(60_000);

describe('Mine search/filters and any-qualification feed (e2e, owner 2026-09-30)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';

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
    await ensurePostPractices(prisma);
    await prisma.state.upsert({
      where: { code: 'NY' },
      create: { code: 'NY', name: 'New York' },
      update: {},
    });
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(baseUrl);

  async function user(role: 'client' | 'attorney', verified = true) {
    const u = await prisma.user.create({
      data: { role, phone_verified_at: role === 'client' ? new Date() : null },
    });
    if (role === 'client') {
      const handle = `cl_${u.id.slice(0, 8)}`;
      await prisma.clientProfile.create({
        data: {
          user_id: u.id,
          state_code: 'NY',
          preferred_languages: ['en'],
          username: handle,
          username_lower: handle,
        },
      });
    }
    if (role === 'attorney') {
      const username = `att_${u.id.slice(0, 8)}`;
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username,
          username_lower: username,
          languages: ['en'],
          verification_status: verified ? 'verified' : 'unverified',
        },
      });
    }
    const token = tokens.signAccessToken({
      sub: u.id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney' && verified,
      subscriptionStatus: 'none',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${token}` } };
  }

  const SUB = 'civil_litigation.arbitration_and_mediation_representation';

  async function mkCase(
    clientId: string,
    title: string,
    code: string,
    status: 'open' | 'in_progress' = 'open',
  ) {
    const area = await prisma.practiceArea.findUniqueOrThrow({
      where: { code },
    });
    const c = await prisma.case.create({
      data: {
        client_id: clientId,
        title,
        description: 'A description long enough for the case.',
        practice_area_id: area.id,
        primary_state_code: 'NY',
        budget_mode: 'clarify_later',
        status,
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'NY', is_primary: true },
    });
    return c.id;
  }

  const ids = (r: request.Response) =>
    (r.body.data as { id: string }[]).map((x) => x.id);

  it('searches and filters the client cases; open vs in progress', async () => {
    const cli = await user('client');
    const a = await mkCase(cli.id, 'Arbitration with my landlord', SUB);
    const b = await mkCase(cli.id, 'Divorce paperwork', 'family_law');
    const c = await mkCase(
      cli.id,
      'Custody hearing',
      'family_law',
      'in_progress',
    );

    const open = await api()
      .get('/api/v1/users/me/cases?filter=open')
      .set(cli.auth);
    expect(open.status).toBe(200);
    expect(ids(open).sort()).toEqual([a, b].sort());
    const inProgress = await api()
      .get('/api/v1/users/me/cases?filter=in_progress')
      .set(cli.auth);
    expect(ids(inProgress)).toEqual([c]);

    const byText = await api()
      .get('/api/v1/users/me/cases?filter=active&q=arbitration%20landlord')
      .set(cli.auth);
    expect(ids(byText)).toEqual([a]);
    const byCategory = await api()
      .get('/api/v1/users/me/cases?filter=active&practice=civil_litigation')
      .set(cli.auth);
    expect(ids(byCategory)).toEqual([a]);
    const byState = await api()
      .get('/api/v1/users/me/cases?filter=active&state=NJ')
      .set(cli.auth);
    expect(ids(byState)).toEqual([]);
  });

  it('the attorney feed shows a picked qualification outside own practices', async () => {
    const cli = await user('client');
    const caseId = await mkCase(
      cli.id,
      'Arbitration clause in a contract',
      SUB,
    );
    const att = await user('attorney');
    await prisma.attorneyLicense.create({
      data: {
        attorney_id: att.id,
        state_code: 'NY',
        bar_number: `NY-${randomUUID()}`,
        license_status: 'verified',
      },
    });
    const family = await prisma.practiceArea.findUniqueOrThrow({
      where: { code: 'family_law' },
    });
    await prisma.attorneyPracticeArea.create({
      data: { attorney_id: att.id, practice_area_id: family.id },
    });
    const all = await api().get('/api/v1/cases').set(att.auth);
    expect(all.status).toBe(200);
    expect(ids(all)).not.toContain(caseId);
    const picked = await api()
      .get('/api/v1/cases?practice=civil_litigation')
      .set(att.auth);
    expect(ids(picked)).toContain(caseId);
    const detail = await api().get(`/api/v1/cases/${caseId}`).set(att.auth);
    expect(detail.status).toBe(200);
    expect(detail.body.data.inMyPractice).toBe(false);
  });
});
