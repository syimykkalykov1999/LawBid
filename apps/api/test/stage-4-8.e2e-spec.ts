import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import {
  NotificationNotCommittedError,
  PushDispatcher,
} from '../src/modules/notifications/push/push-dispatcher';
import { PUSH_QUEUE } from '../src/modules/notifications/push/push.constants';

/**
 * docs/04_CASES_BIDS.md §16 stage 4.8 acceptance, against real
 * CockroachDB/Redis:
 *  - every §13 event of a full negotiation creates exactly one row for its
 *    recipient; a retried request (same Idempotency-Key) creates none;
 *  - each stored row is queued for push exactly once (jobId = row id),
 *    `case_updated` is list-only;
 *  - the dispatcher localizes by users.ui_language, honours a disabled
 *    category, and drops a row that never committed.
 */
jest.setTimeout(90_000);

describe('Case & bid notifications (e2e, docs/04 §13, stage 4.8)', () => {
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
      where: { code: 'e2e_notif_leaf' },
      create: {
        code: 'e2e_notif_leaf',
        name_en: 'E2E notif',
        i18n_key: 'practice.e2e_notif_leaf',
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
      // docs/06 §1.2: bids require an active subscription (stage 6.7).
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

  const count = (userId: string, type: string, caseId: string) =>
    prisma.notification.count({
      where: {
        user_id: userId,
        type: type as never,
        payload: { path: ['caseId'], equals: caseId },
      },
    });

  it('a full negotiation: one row per event and recipient; retries add none', async () => {
    const client = await user('client');
    const a1 = await user('attorney');
    const a2 = await user('attorney');
    const caseId = await kase(client.id);

    const key = randomUUID();
    const b1 = await postBid(a1.auth, caseId, bidBody(), key);
    expect(b1.status).toBe(201);
    // Retried request with the same key: replayed, no second bid/notification.
    expect((await postBid(a1.auth, caseId, bidBody(), key)).status).toBe(201);
    await postBid(a2.auth, caseId, bidBody({ amountCents: 55_000 }));
    expect(await count(client.id, 'bid_received', caseId)).toBe(2);

    const bid1 = b1.body.data.id as string;
    const counter = await api()
      .post(`/api/v1/bids/${bid1}/counter`)
      .set(client.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ amountCents: 50_000 });
    expect(counter.status).toBe(201);
    expect(await count(a1.id, 'offer_countered', caseId)).toBe(1);

    const acceptKey = randomUUID();
    const acc = await api()
      .post(`/api/v1/bids/${bid1}/accept`)
      .set(a1.auth)
      .set('Idempotency-Key', acceptKey)
      .send({});
    expect(acc.status).toBe(200);
    await api()
      .post(`/api/v1/bids/${bid1}/accept`)
      .set(a1.auth)
      .set('Idempotency-Key', acceptKey)
      .send({});
    expect(await count(client.id, 'offer_accepted', caseId)).toBe(1);
    expect(await count(a2.id, 'bid_rejected', caseId)).toBe(1);

    await api()
      .post(`/api/v1/cases/${caseId}/complete`)
      .set(client.auth)
      .send({});
    await api()
      .post(`/api/v1/cases/${caseId}/complete`)
      .set(client.auth)
      .send({}); // second click: 409, nothing new
    expect(await count(a1.id, 'completion_requested', caseId)).toBe(1);
    await api()
      .post(`/api/v1/cases/${caseId}/confirm-completion`)
      .set(a1.auth)
      .send({});
    expect(await count(client.id, 'case_closed', caseId)).toBe(1);
    expect(await count(a1.id, 'case_closed', caseId)).toBe(1);
  });

  it('each stored row is queued once; case_updated is list-only', async () => {
    const client = await user('client');
    const notifications = app.get(NotificationsService);
    const bidRow = await notifications.emit({
      type: 'bid_received',
      recipientId: client.id,
      payload: { caseId: randomUUID() },
    });
    const listOnly = await notifications.emit({
      type: 'case_updated',
      recipientId: client.id,
      payload: { caseId: randomUUID() },
    });
    const queue = new Queue(PUSH_QUEUE, {
      connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
    });
    try {
      const job = await queue.getJob(bidRow!.id);
      expect(job?.data).toEqual({
        kind: 'notification',
        notificationId: bidRow!.id,
        push: true,
      });
      // docs/05 §9.3: every row is delivered (realtime + badge); a
      // list-only type never gets a push.
      expect((await queue.getJob(listOnly!.id))?.data).toEqual({
        kind: 'notification',
        notificationId: listOnly!.id,
        push: false,
      });
    } finally {
      await queue.close();
    }
  });

  it('dispatcher: localized by ui_language, honours a disabled category, drops rolled-back rows', async () => {
    const dispatcher = app.get(PushDispatcher);
    const client = await user('client');
    await prisma.user.update({
      where: { id: client.id },
      data: { ui_language: 'ru' },
    });
    const sent: { title: string }[] = [];
    const sender = (dispatcher as unknown as { sender: { send: jest.Mock } })
      .sender;
    const spy = jest
      .spyOn(sender, 'send')
      .mockImplementation((m: { title: string }) => {
        sent.push(m);
        return Promise.resolve();
      });

    const row = await prisma.notification.create({
      data: {
        user_id: client.id,
        type: 'bid_received',
        category: 'bids',
        payload: { caseId: randomUUID() },
      },
    });
    expect(await dispatcher.dispatch({ notificationId: row.id }, row.id)).toBe(
      'sent',
    );
    expect(sent[0]?.title).toBe('Новый бид');

    await prisma.notificationSetting.create({
      data: { user_id: client.id, category: 'bids', push_enabled: false },
    });
    expect(await dispatcher.dispatch({ notificationId: row.id }, row.id)).toBe(
      'disabled',
    );

    await expect(
      dispatcher.dispatch({ notificationId: randomUUID() }, 'x'),
    ).rejects.toBeInstanceOf(NotificationNotCommittedError);
    spy.mockRestore();
  });
});
