import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * docs/04 §11 "Моё" / §15 support routes for the app (stages 4.9/4.10):
 * owner case detail, "Мои биды", "В работе", saved cases, "Написать
 * клиенту" — access rules and the §8.3 subscription gate on the name.
 */
jest.setTimeout(90_000);

describe('Mine routes (e2e, docs/04 §11)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';
  let practiceAreaId = '';

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

    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey', is_active: true },
      update: {},
    });
    const area = await prisma.practiceArea.upsert({
      where: { code: 'e2e_mine_leaf' },
      create: {
        code: 'e2e_mine_leaf',
        name_en: 'E2E mine',
        i18n_key: 'practice.e2e_mine_leaf',
        sort: 1,
      },
      update: {},
    });
    practiceAreaId = area.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(baseUrl);

  async function user(
    role: 'client' | 'attorney',
    opts: { verified?: boolean; practiceAreaIds?: string[] } = {},
  ): Promise<{ id: string; auth: Record<string, string> }> {
    const u = await prisma.user.create({ data: { role } });
    if (role === 'attorney') {
      const username = `att_${u.id.slice(0, 8)}`;
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username,
          username_lower: username,
          languages: ['en'],
          verification_status:
            opts.verified === false ? 'unverified' : 'verified',
        },
      });
      await prisma.attorneyLicense.create({
        data: {
          attorney_id: u.id,
          state_code: 'NJ',
          bar_number: `NJ-${randomUUID()}`,
          license_status: 'verified',
        },
      });
      for (const id of opts.practiceAreaIds ?? [practiceAreaId]) {
        await prisma.attorneyPracticeArea.create({
          data: { attorney_id: u.id, practice_area_id: id },
        });
      }
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

  async function kase(
    clientId: string,
    opts: { areaId?: string } = {},
  ): Promise<string> {
    const c = await prisma.case.create({
      data: {
        client_id: clientId,
        title: 'Speeding ticket in Trenton',
        description: 'Got a ticket on the turnpike last week driving home.',
        practice_area_id: opts.areaId ?? practiceAreaId,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'NJ', is_primary: true },
    });
    return c.id;
  }

  function bidBody(overrides: Record<string, unknown> = {}) {
    return {
      feeType: 'fixed',
      amountCents: 60_000,
      message: 'I handle NJ speeding tickets every week, happy to help.',
      startAvailability: 'immediately',
      ...overrides,
    };
  }

  function postBid(
    auth: Record<string, string>,
    caseId: string,
    body: Record<string, unknown>,
    key: string | null = randomUUID(),
  ) {
    const req = api().post(`/api/v1/cases/${caseId}/bids`).set(auth);
    if (key !== null) req.set('Idempotency-Key', key);
    return req.send(body);
  }

  async function withClientContacts(clientId: string): Promise<void> {
    await prisma.user.update({
      where: { id: clientId },
      data: {
        first_name: 'Dana',
        last_name: 'Client',
        phone_e164: `+1201${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
        email: `client_${clientId.slice(0, 8)}@example.com`,
      },
    });
  }

  async function bidOn(
    auth: Record<string, string>,
    caseId: string,
  ): Promise<string> {
    const res = await postBid(auth, caseId, bidBody());
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  const accept = (auth: Record<string, string>, bidId: string) =>
    api()
      .post(`/api/v1/bids/${bidId}/accept`)
      .set(auth)
      .set('Idempotency-Key', randomUUID())
      .send({});

  async function acceptedCase() {
    const client = await user('client');
    await withClientContacts(client.id);
    const winner = await user('attorney');
    const caseId = await kase(client.id);
    const bidId = await bidOn(winner.auth, caseId);
    const res = await accept(client.auth, bidId);
    expect(res.status).toBe(200);
    return { client, winner, caseId, bidId };
  }

  const get = (auth: Record<string, string>, path: string) =>
    api().get(`/api/v1${path}`).set(auth);

  it('owner case detail with the accepted attorney; others get 404', async () => {
    const { client, winner, caseId, bidId } = await acceptedCase();
    const res = await get(client.auth, `/users/me/cases/${caseId}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: caseId,
      status: 'in_progress',
      acceptedBid: { id: bidId, attorney: { id: winner.id } },
    });
    expect(res.body.data.conversationId).toEqual(expect.any(String));
    const other = await user('client');
    expect((await get(other.auth, `/users/me/cases/${caseId}`)).status).toBe(
      404,
    );
    expect((await get(winner.auth, `/users/me/cases/${caseId}`)).status).toBe(
      404,
    );
  });

  it('"Мои биды" active/finished and "В работе" with the subscription gate', async () => {
    const { winner, caseId } = await acceptedCase();
    const active = await get(winner.auth, '/users/me/bids?filter=active');
    expect(active.status).toBe(200);
    expect(
      (active.body.data as { caseId: string }[]).some(
        (b) => b.caseId === caseId,
      ),
    ).toBe(false);
    const finished = await get(winner.auth, '/users/me/bids?filter=finished');
    const mine = (
      finished.body.data as {
        caseId: string;
        status: string;
        case: { title: string };
      }[]
    ).find((b) => b.caseId === caseId);
    expect(mine).toMatchObject({
      status: 'accepted',
      case: { title: expect.any(String) },
    });

    const work = await get(winner.auth, '/users/me/work');
    const row = (
      work.body.data as { caseId: string; clientName: string | null }[]
    ).find((w) => w.caseId === caseId);
    expect(row?.clientName).toBe('Dana Client');

    await prisma.attorneyProfile.update({
      where: { user_id: winner.id },
      data: { verification_status: 'suspended' },
    });
    const locked = await get(winner.auth, '/users/me/work');
    expect(
      (
        locked.body.data as { caseId: string; clientName: string | null }[]
      ).find((w) => w.caseId === caseId)?.clientName,
    ).toBeNull();
    const client = await user('client');
    expect((await get(client.auth, '/users/me/bids')).status).toBe(403);
  });

  it('saved cases: open ones as cards, closed ones as unavailable', async () => {
    const client = await user('client');
    const attorney = await user('attorney');
    const openCase = await kase(client.id);
    const closedCase = await kase(client.id);
    for (const id of [openCase, closedCase]) {
      const r = await api()
        .post('/api/v1/saved-items')
        .set(attorney.auth)
        .send({ itemType: 'case', itemId: id });
      expect([200, 201, 204]).toContain(r.status);
    }
    await prisma.case.update({
      where: { id: closedCase },
      data: { status: 'closed' },
    });
    const res = await get(attorney.auth, '/saved-items?type=case');
    expect(res.status).toBe(200);
    const items = res.body.data as { caseId: string; available: boolean }[];
    expect(items.find((i) => i.caseId === openCase)?.available).toBe(true);
    expect(items.find((i) => i.caseId === closedCase)?.available).toBe(false);
  });

  it('"Написать клиенту": one conversation per pair, subscription required', async () => {
    const client = await user('client');
    const attorney = await user('attorney');
    const caseId = await kase(client.id);
    const open = () =>
      api()
        .post(`/api/v1/cases/${caseId}/conversation`)
        .set(attorney.auth)
        .send({});
    const a = await open();
    expect(a.status).toBe(200);
    expect(a.body.data).toMatchObject({
      status: 'pre_acceptance',
      contactsUnlocked: false,
    });
    const b = await open();
    expect(b.body.data.conversationId).toBe(a.body.data.conversationId);

    await prisma.attorneyProfile.update({
      where: { user_id: attorney.id },
      data: { verification_status: 'suspended' },
    });
    const denied = await open();
    // Still a participant (the chat exists) but the subscription lapsed.
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
  });
});
