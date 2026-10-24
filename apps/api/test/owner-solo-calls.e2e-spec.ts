import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { CallsService } from '../src/modules/calls/calls.service';
import { AppSettingsService } from '../src/common/app-settings/app-settings.service';

/**
 * Owner 2026-10-23: a call with one person left ends after the grace
 * (`calls.solo_end_seconds`): the last person sees the normal «call ended»,
 * the log entry is written once, someone rejoining within the grace keeps the
 * call, and several API instances / the cron never end it twice.
 */
jest.setTimeout(120_000);
const GRACE_S = 2;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Solo call end (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';
  const sockets: Socket[] = [];

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
    // A short grace so the suite does not wait 30 s.
    const settings = app.get(AppSettingsService);
    const real = settings.number.bind(settings);
    jest
      .spyOn(settings, 'number')
      .mockImplementation((k) =>
        k === 'calls.solo_end_seconds' ? Promise.resolve(GRACE_S) : real(k),
      );
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
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
  const auth = (id: string, role: 'client' | 'attorney') => ({
    Authorization: `Bearer ${token(id, role)}`,
  });

  async function attorney(first: string) {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: first, last_name: 'Group' },
    });
    const username = `grp_${u.id.slice(0, 8)}`;
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
    return { id: u.id, username };
  }

  async function chatBetween(clientId: string, attorneyId: string) {
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
        client_id: clientId,
        title: 'Group call case',
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
        client_id: clientId,
        attorney_id: attorneyId,
        status: 'active',
        contacts_unlocked: true,
        participants: {
          create: [{ user_id: clientId }, { user_id: attorneyId }],
        },
      },
    });
    return conv.id;
  }

  function connect(t: string): Promise<Socket> {
    const s = io(`${base}/realtime`, {
      auth: { token: t },
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(s);
    return new Promise((resolve, reject) => {
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });
  }

  const once = <T>(s: Socket, event: string) =>
    new Promise<T>((resolve) => s.once(event, resolve));

  /** client + a1 + a2 all in one running call. */
  async function threeInCall() {
    const client = await prisma.user.create({
      data: { role: 'client', first_name: 'Solo', last_name: 'Group' },
    });
    const a1 = await attorney('Sol');
    const a2 = await attorney('Sia');
    const conv1 = await chatBetween(client.id, a1.id);
    await chatBetween(client.id, a2.id);
    const cAuth = auth(client.id, 'client');
    const a1Auth = auth(a1.id, 'attorney');
    const a2Auth = auth(a2.id, 'attorney');
    const started = await api()
      .post(`/api/v1/conversations/${conv1}/calls`)
      .set(a1Auth)
      .expect(201);
    const callId = started.body.data.id as string;
    await api().post(`/api/v1/calls/${callId}/accept`).set(cAuth).expect(200);
    await api()
      .post(`/api/v1/calls/${callId}/participants`)
      .set(cAuth)
      .send({ userId: a2.id })
      .expect(200);
    await api().post(`/api/v1/calls/${callId}/accept`).set(a2Auth).expect(200);
    const hangUp = (a: { Authorization: string }) =>
      api().post(`/api/v1/calls/${callId}/end`).set(a).send({}).expect(200);
    return { callId, a2, cAuth, a1Auth, a2Auth, hangUp, conv1 };
  }

  const logs = (callId: string) =>
    prisma.message.count({ where: { client_message_id: `call:${callId}` } });

  it('one person left: the call ends after the grace, once, for them too', async () => {
    const t = await threeInCall();
    const a2Sock = await connect(token(t.a2.id, 'attorney'));
    await t.hangUp(t.a1Auth);
    const ended = once<{ call: { status: string } }>(a2Sock, 'call:ended');
    await t.hangUp(t.cAuth);
    // One (a2) is left: the call is still up and stamped.
    const mid = await prisma.call.findUniqueOrThrow({
      where: { id: t.callId },
    });
    expect(mid.status).toBe('active');
    expect(mid.solo_since).not.toBeNull();
    expect((await ended).call.status).toBe('ended');
    const done = await prisma.call.findUniqueOrThrow({
      where: { id: t.callId },
    });
    expect(done.status).toBe('ended');
    expect(done.solo_since).not.toBeNull();
    // The length is until the second to last left, not the grace on top.
    expect(done.ended_at?.getTime()).toBe(done.solo_since?.getTime());
    expect(await logs(t.callId)).toBe(1);
  });

  it('somebody rejoining within the grace keeps the call going', async () => {
    const t = await threeInCall();
    await t.hangUp(t.a1Auth);
    await t.hangUp(t.cAuth);
    const back = await api()
      .post(`/api/v1/calls/${t.callId}/join`)
      .set(t.cAuth)
      .expect(200);
    expect(back.body.data.status).toBe('active');
    await sleep(GRACE_S * 1000 + 1500);
    const still = await prisma.call.findUniqueOrThrow({
      where: { id: t.callId },
    });
    expect(still.status).toBe('active');
    expect(still.solo_since).toBeNull();
    expect(await logs(t.callId)).toBe(0);
    await t.hangUp(t.cAuth);
    await t.hangUp(t.a2Auth);
  });

  it('several instances and the cron end it once', async () => {
    const t = await threeInCall();
    await t.hangUp(t.a1Auth);
    await t.hangUp(t.cAuth);
    // Two "instances" (the same code on the same database) and the cron
    // sweep all try at the deadline.
    const svc = app.get(CallsService);
    await sleep(GRACE_S * 1000 + 100);
    await Promise.all([
      svc.endSolo(t.callId),
      svc.endSolo(t.callId),
      svc.sweep(),
    ]);
    await sleep(500);
    const done = await prisma.call.findUniqueOrThrow({
      where: { id: t.callId },
    });
    expect(done.status).toBe('ended');
    expect(await logs(t.callId)).toBe(1);
  });

  it('a call nobody is connected to ends', async () => {
    const t = await threeInCall();
    await prisma.callParticipant.updateMany({
      where: { call_id: t.callId },
      data: { status: 'left', left_at: new Date() },
    });
    await prisma.call.update({
      where: { id: t.callId },
      data: { created_at: new Date(Date.now() - 5 * 60_000) },
    });
    await app.get(CallsService).sweep();
    const done = await prisma.call.findUniqueOrThrow({
      where: { id: t.callId },
    });
    expect(done.status).toBe('ended');
  });
});
