import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { BidConfirmReminderJob } from '../src/jobs/handlers/case-lifecycle.jobs';
import { TokenService } from '../src/modules/auth/services/token.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

/** Owner 2026-11-05: a change of an open case makes active bids wait for the
 * attorney (`bids.confirmation_required`). */
jest.setTimeout(180_000);

describe('Bid confirmation after a case change (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let redis: Redis;
  let baseUrl = '';
  let practiceAreaId = '';
  const SWITCH = 'bids.confirmation_required';

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
    redis = app.get<Redis>(REDIS_CLIENT);
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey', is_active: true },
      update: {},
    });
    const area = await prisma.practiceArea.upsert({
      where: { code: 'e2e_confirm_leaf' },
      create: {
        code: 'e2e_confirm_leaf',
        name_en: 'E2E bid confirmation',
        i18n_key: 'practice.e2e_confirm_leaf',
        sort: 1,
      },
      update: {},
    });
    practiceAreaId = area.id;
  });

  afterAll(async () => {
    await setSwitch(SWITCH, null);
    await app.close();
  });

  const api = () => request(baseUrl);

  async function setSwitch(key: string, value: boolean | null): Promise<void> {
    if (value === null) await prisma.appConfig.deleteMany({ where: { key } });
    else
      await prisma.appConfig.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    await redis.del('config:app_config'); // bypass the 30 s cache
  }

  async function user(
    role: 'client' | 'attorney',
    names: { first: string; last: string | null } = {
      first: role === 'client' ? 'Anna' : 'John',
      last: role === 'client' ? 'Petrova' : 'Smith',
    },
  ) {
    const u = await prisma.user.create({
      data: {
        role,
        first_name: names.first,
        last_name: names.last,
        email: `${role}_${randomUUID().slice(0, 8)}@example.com`,
        phone_e164: `+1201${Math.floor(2_000_000 + Math.random() * 7_999_999)}`,
        phone_verified_at: new Date(),
      },
    });
    const handle = `${role.slice(0, 2)}_${u.id.slice(0, 8)}`;
    if (role === 'client') {
      await prisma.clientProfile.create({
        data: {
          user_id: u.id,
          state_code: 'NJ',
          preferred_languages: ['en'],
          username: handle,
          username_lower: handle,
        },
      });
    } else {
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username: handle,
          username_lower: handle,
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
          bar_number: `NJ-${u.id.slice(0, 6)}`,
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

  async function kase(clientId: string): Promise<string> {
    const c = await prisma.case.create({
      data: {
        client_id: clientId,
        title: 'Speeding ticket in Trenton — штраф (ң ө ү)',
        description: 'Got a ticket on the turnpike last week driving home.',
        practice_area_id: practiceAreaId,
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

  const bidBody = (overrides: Record<string, unknown> = {}) => ({
    feeType: 'fixed',
    amountCents: 60_000,
    message: 'I handle NJ speeding tickets every week, happy to help.',
    startAvailability: 'immediately',
    ...overrides,
  });

  async function setup() {
    const client = await user('client');
    const attorney = await user('attorney');
    const caseId = await kase(client.id);
    const res = await api()
      .post(`/api/v1/cases/${caseId}/bids`)
      .set(attorney.auth)
      .set('Idempotency-Key', randomUUID())
      .send(bidBody())
      .expect(201);
    const body = res.body as { data: { id: string } };
    return { client, attorney, caseId, bidId: body.data.id };
  }

  type BidJson = {
    data: {
      confirmationRequiredAt: string | null;
      turn: string;
      roundCount: number;
      feeType: string;
      version: number;
    };
  };

  const getBid = async (bidId: string, auth: Record<string, string>) =>
    (await api().get(`/api/v1/bids/${bidId}`).set(auth).expect(200))
      .body as BidJson;

  const edit = (caseId: string, auth: Record<string, string>) =>
    api()
      .patch(`/api/v1/cases/${caseId}`)
      .set(auth)
      .send({ description: 'New facts: there was a second ticket as well.' })
      .expect(200);

  it('switch off: nothing changes', async () => {
    await setSwitch(SWITCH, false);
    const s = await setup();
    await edit(s.caseId, s.client.auth);
    const bid = await getBid(s.bidId, s.attorney.auth);
    expect(bid.data.confirmationRequiredAt).toBeNull();
  });

  it('a change blocks accepting until «Бид в силе»; the changes are listed', async () => {
    await setSwitch(SWITCH, true);
    const s = await setup();
    await edit(s.caseId, s.client.auth);
    const bid = await getBid(s.bidId, s.attorney.auth);
    expect(bid.data.confirmationRequiredAt).not.toBeNull();

    const refused = await api()
      .post(`/api/v1/bids/${s.bidId}/accept`)
      .set(s.client.auth)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(409);
    expect((refused.body as { error: { code: string } }).error.code).toBe(
      'BID_CONFIRMATION_REQUIRED',
    );

    const changes = await api()
      .get(`/api/v1/bids/${s.bidId}/case-changes`)
      .set(s.attorney.auth)
      .expect(200);
    const list = (
      changes.body as { data: { field: string; newValue: string }[] }
    ).data;
    expect(list.map((c) => c.field)).toEqual(['description']);
    expect(list[0].newValue).toContain('second ticket');

    await api()
      .get(`/api/v1/bids/${s.bidId}/case-changes`)
      .set(s.client.auth)
      .expect(404);

    await api()
      .post(`/api/v1/bids/${s.bidId}/confirm`)
      .set(s.attorney.auth)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect((r) => expect(r.status).toBeLessThan(300));
    const after = await getBid(s.bidId, s.attorney.auth);
    expect(after.data.confirmationRequiredAt).toBeNull();

    // Nothing new since the confirmation.
    const none = await api()
      .get(`/api/v1/bids/${s.bidId}/case-changes`)
      .set(s.attorney.auth)
      .expect(200);
    expect((none.body as { data: unknown[] }).data).toEqual([]);

    await api()
      .post(`/api/v1/bids/${s.bidId}/accept`)
      .set(s.client.auth)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
  });

  it('«Поменять бид» after a change: out of turn, no round, confirms, tells the client; only the last version is accepted', async () => {
    await setSwitch(SWITCH, true);
    const s = await setup();
    const before = await getBid(s.bidId, s.client.auth);
    await edit(s.caseId, s.client.auth);
    expect(before.data.turn).toBe('client');

    const res = await api()
      .post(`/api/v1/bids/${s.bidId}/change`)
      .set(s.attorney.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ feeType: 'hourly', amountCents: 25_000, message: 'New rate.' })
      .expect((r) => expect(r.status).toBeLessThan(300));
    const changed = res.body as BidJson;
    expect(changed.data.feeType).toBe('hourly');
    expect(changed.data.roundCount).toBe(before.data.roundCount);
    expect(changed.data.turn).toBe('client');
    expect(changed.data.confirmationRequiredAt).toBeNull();

    const told = await prisma.notification.findFirst({
      where: { user_id: s.client.id, type: 'bid_changed' },
    });
    expect(told).not.toBeNull();

    // A client who still sees the old version does not accept it.
    await api()
      .post(`/api/v1/bids/${s.bidId}/accept`)
      .set(s.client.auth)
      .set('Idempotency-Key', randomUUID())
      .set('If-Match', `${before.data.version}`)
      .send({})
      .expect(409);
    await api()
      .post(`/api/v1/bids/${s.bidId}/accept`)
      .set(s.client.auth)
      .set('Idempotency-Key', randomUUID())
      .set('If-Match', `${changed.data.version}`)
      .send({})
      .expect(200);
  });

  it("«Поменять бид» without a change: only on the attorney's turn", async () => {
    await setSwitch(SWITCH, true);
    const s = await setup();
    await api()
      .post(`/api/v1/bids/${s.bidId}/change`)
      .set(s.attorney.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ feeType: 'fixed', amountCents: 50_000 })
      .expect(409);
  });

  it('one reminder, no withdrawal', async () => {
    await setSwitch(SWITCH, true);
    const s = await setup();
    await edit(s.caseId, s.client.auth);
    await prisma.bid.update({
      where: { id: s.bidId },
      data: {
        confirmation_required_at: new Date(Date.now() - 30 * 86_400_000),
      },
    });
    const job = app.get(BidConfirmReminderJob);
    await job.run();
    await job.run();
    const sent = await prisma.notification.count({
      where: { user_id: s.attorney.id, type: 'bid_confirm_reminder' },
    });
    expect(sent).toBe(1);
    const bid = await getBid(s.bidId, s.attorney.auth);
    expect(bid.data.confirmationRequiredAt).not.toBeNull();
  });
});
