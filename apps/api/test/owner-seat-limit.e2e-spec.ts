import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { SeatLimitRequestsService } from '../src/modules/admin-billing/seat-limit-requests.service';
import type { AdminActor } from '../src/modules/admin-auth/admin-auth.decorators';

/**
 * Owner 2026-10-05: the assistant limit comes from the admin setting
 * billing.max_assistant_seats (default 10); an attorney who needs more
 * sends a request, an admin approves it with a personal limit.
 */
jest.setTimeout(60_000);

describe('Assistant seat limit and requests (e2e, owner 2026-10-05)', () => {
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
    app.setGlobalPrefix('api/v1', {
      exclude: ['/health/live', '/health/ready', '/docs', '/docs-json'],
    });
    await app.listen(0, '127.0.0.1');
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(baseUrl);

  async function attorney(): Promise<{
    id: string;
    auth: Record<string, string>;
  }> {
    const u = await prisma.user.create({ data: { role: 'attorney' } });
    const username = `seat_${u.id.slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    const token = tokens.signAccessToken({
      sub: u.id,
      role: 'attorney',
      sid: randomUUID(),
      verified: true,
      subscriptionStatus: 'none',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${token}` } };
  }

  async function admin(): Promise<AdminActor> {
    const u = await prisma.user.create({ data: { role: 'admin' } });
    return { id: u.id, ip: null } as unknown as AdminActor;
  }

  it('the default limit is 10, in /pricing and /subscriptions/me', async () => {
    const a = await attorney();
    const pricing = await api().get('/api/v1/pricing').expect(200);
    expect(pricing.body.data.maxSeats).toBe(10);
    const me = await api()
      .get('/api/v1/subscriptions/me')
      .set(a.auth)
      .expect(200);
    expect(me.body.data.prices.maxSeats).toBe(10);
  });

  it('request → one pending at a time → approve sets a personal limit', async () => {
    const a = await attorney();
    const state0 = await api()
      .get('/api/v1/billing/seat-limit-requests/latest')
      .set(a.auth)
      .expect(200);
    expect(state0.body.data).toEqual({
      limit: 10,
      isPersonal: false,
      request: null,
    });

    // At or under the current limit: nothing to ask for.
    const low = await api()
      .post('/api/v1/billing/seat-limit-requests')
      .set(a.auth)
      .send({ seats: 10 });
    expect(low.status).toBe(400);

    const res = await api()
      .post('/api/v1/billing/seat-limit-requests')
      .set(a.auth)
      .send({ seats: 15, note: 'Our firm has 14 paralegals.' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: 'pending',
      requestedSeats: 15,
    });

    const again = await api()
      .post('/api/v1/billing/seat-limit-requests')
      .set(a.auth)
      .send({ seats: 20 });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('SEAT_LIMIT_REQUEST_PENDING');

    const svc = app.get(SeatLimitRequestsService);
    const queue = await svc.list({ status: 'pending' });
    expect(queue.items).toContainEqual(
      expect.objectContaining({
        id: res.body.data.id,
        attorneyId: a.id,
        currentLimit: 10,
        assistantsUsed: 0,
      }),
    );
    const decided = await svc.approve(await admin(), res.body.data.id, 14);
    expect(decided).toMatchObject({ status: 'approved', grantedSeats: 14 });

    const me = await api()
      .get('/api/v1/subscriptions/me')
      .set(a.auth)
      .expect(200);
    expect(me.body.data.prices.maxSeats).toBe(14);
    const state1 = await api()
      .get('/api/v1/billing/seat-limit-requests/latest')
      .set(a.auth)
      .expect(200);
    expect(state1.body.data).toMatchObject({
      limit: 14,
      isPersonal: true,
      request: { status: 'approved', grantedSeats: 14 },
    });
    const notif = await prisma.notification.findFirst({
      where: { user_id: a.id, type: 'subscription_status' },
    });
    expect(notif?.payload).toMatchObject({ kind: 'seat_limit_approved' });

    // A decided request can't be decided again.
    await expect(
      svc.reject(await admin(), res.body.data.id),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('reject keeps the limit; a new request is allowed after', async () => {
    const a = await attorney();
    const res = await api()
      .post('/api/v1/billing/seat-limit-requests')
      .set(a.auth)
      .send({ seats: 12 })
      .expect(201);
    const svc = app.get(SeatLimitRequestsService);
    await svc.reject(await admin(), res.body.data.id, 'Not now');
    const state = await api()
      .get('/api/v1/billing/seat-limit-requests/latest')
      .set(a.auth)
      .expect(200);
    expect(state.body.data).toMatchObject({
      limit: 10,
      isPersonal: false,
      request: { status: 'rejected', decisionNote: 'Not now' },
    });
    await api()
      .post('/api/v1/billing/seat-limit-requests')
      .set(a.auth)
      .send({ seats: 12 })
      .expect(201);
  });
});
