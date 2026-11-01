import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { PushQueueService } from '../src/modules/notifications/push/push-queue.service';
import { callPollKey, signCallPoll } from '../src/common/calls/call-poll-token';

/**
 * Owner 2026-10-28 (a locked Samsung kept ringing after the caller hung up
 * before it was answered; its wake path asked GET /calls/:id with no token
 * and got 401): the cancel sends the callee the «stop ringing» push, and
 * the ringing phone asks GET /calls/:id/status?t=<ticket of the ring push>
 * with no session — valid only for that call and only for a few minutes.
 */
jest.setTimeout(120_000);

describe('Cancel before answer + token-only ring status (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let key: Buffer;
  let base = '';

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
    key = callPollKey(
      app.get(ConfigService).getOrThrow<string>('AUTH_EVENT_PEPPER'),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);
  const token = (id: string, role: 'client' | 'attorney') =>
    tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    });
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function chat(unlocked = true) {
    const client = await prisma.user.create({
      data: { role: 'client', first_name: 'Cara', last_name: 'Caller' },
    });
    const attorney = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Paul', last_name: 'Phone' },
    });
    await prisma.attorneyProfile.create({
      data: {
        user_id: attorney.id,
        username: `call_${attorney.id.slice(0, 8)}`,
        username_lower: `call_${attorney.id.slice(0, 8)}`,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    await prisma.subscription.create({
      data: { user_id: attorney.id, status: 'active', price_cents: 39900 },
    });
    const parent = await prisma.practiceArea.upsert({
      where: { code: 'calls_e2e' },
      create: {
        code: 'calls_e2e',
        name_en: 'Calls e2e',
        i18n_key: 'practice.calls_e2e',
        sort: 0,
      },
      update: {},
    });
    const area = await prisma.practiceArea.upsert({
      where: { code: 'calls_e2e.leaf' },
      create: {
        code: 'calls_e2e.leaf',
        parent_id: parent.id,
        name_en: 'Leaf',
        i18n_key: 'practice.calls_e2e.leaf',
        sort: 0,
      },
      update: {},
    });
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey' },
      update: {},
    });
    const kase = await prisma.case.create({
      data: {
        client_id: client.id,
        title: 'Call case',
        description: 'Details',
        practice_area_id: area.id,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    const conv = await prisma.conversation.create({
      data: {
        case_id: kase.id,
        client_id: client.id,
        attorney_id: attorney.id,
        status: unlocked ? 'active' : 'pre_acceptance',
        contacts_unlocked: unlocked,
        participants: {
          create: [{ user_id: client.id }, { user_id: attorney.id }],
        },
      },
    });
    const cTok = token(client.id, 'client');
    const aTok = token(attorney.id, 'attorney');
    return {
      id: conv.id,
      client: { id: client.id, token: cTok, auth: bearer(cTok) },
      attorney: { id: attorney.id, token: aTok, auth: bearer(aTok) },
    };
  }

  const status = (callId: string, t: string) =>
    api().get(`/api/v1/calls/${callId}/status`).query({ t });

  it('the caller cancels: the callee gets «stop ringing», the ticket reads «ended»', async () => {
    const c = await chat();
    const push = app.get(PushQueueService);
    const spy = jest.spyOn(push, 'enqueueCallEnded');
    const started = await api()
      .post(`/api/v1/conversations/${c.id}/calls`)
      .set(c.attorney.auth)
      .expect(201);
    const callId = started.body.data.id as string;
    const t = signCallPoll(key, { c: callId, u: c.client.id });

    // No session header at all — only the ticket.
    const ringing = await status(callId, t).expect(200);
    expect(ringing.body.data).toEqual({ state: 'ringing' });

    await api()
      .post(`/api/v1/calls/${callId}/end`)
      .set(c.attorney.auth)
      .send({})
      .expect(200);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({
      recipientId: c.client.id,
      callId,
    });
    // «Stop ringing», not «the answered call is over».
    expect(spy.mock.calls[0][0].ended).toBeUndefined();
    spy.mockRestore();

    const ended = await status(callId, t).expect(200);
    expect(ended.body.data).toEqual({ state: 'ended' });
  });

  it('refuses an expired ticket, a ticket of another call, and none', async () => {
    const c = await chat();
    const started = await api()
      .post(`/api/v1/conversations/${c.id}/calls`)
      .set(c.attorney.auth)
      .expect(201);
    const callId = started.body.data.id as string;
    const expired = signCallPoll(
      key,
      { c: callId, u: c.client.id },
      Date.now() - 10 * 60_000,
    );
    await status(callId, expired).expect(401);
    const other = signCallPoll(key, { c: randomUUID(), u: c.client.id });
    await status(callId, other).expect(401);
    await api().get(`/api/v1/calls/${callId}/status`).expect(400);
    // The normal call read still needs the session.
    await api().get(`/api/v1/calls/${callId}`).expect(401);
    await api()
      .post(`/api/v1/calls/${callId}/end`)
      .set(c.attorney.auth)
      .send({})
      .expect(200);
  });
});
