import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { AppSettingsService } from '../src/common/app-settings/app-settings.service';
import { JobsRunner } from '../src/jobs/jobs.runner';

/**
 * Verify 5b (17.11, owner: «звонящий закрыл приложение, а у второго звонит
 * ещё минуту»): the caller's app dies while a 1:1 call rings (its last
 * socket closes). After `calls.caller_gone_seconds` (1 s here instead of 15)
 * the delayed `calls.caller-gone` job on the cron-fast lane cancels the call:
 * the callee hears `call:ended`, the row is «canceled» / `caller_gone` —
 * well before the 65 s ring timeout. A caller back within the window keeps
 * the call ringing.
 */
jest.setTimeout(120_000);
const WINDOW_S = 1;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Caller gone while ringing (e2e)', () => {
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
    const settings = app.get(AppSettingsService);
    const real = settings.number.bind(settings);
    jest
      .spyOn(settings, 'number')
      .mockImplementation((k) =>
        k === 'calls.caller_gone_seconds' ? Promise.resolve(WINDOW_S) : real(k),
      );
    // The worker that runs the delayed job is this process's JobsRunner.
    await app.get(JobsRunner).whenStarted();
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
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function chat() {
    const client = await prisma.user.create({
      data: { role: 'client', first_name: 'Cara', last_name: 'Caller' },
    });
    const attorney = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Paul', last_name: 'Phone' },
    });
    await prisma.attorneyProfile.create({
      data: {
        user_id: attorney.id,
        username: `gone_${attorney.id.slice(0, 8)}`,
        username_lower: `gone_${attorney.id.slice(0, 8)}`,
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
        status: 'active',
        contacts_unlocked: true,
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

  async function ringingCall() {
    const c = await chat();
    const callerSock = await connect(c.attorney.token);
    const calleeSock = await connect(c.client.token);
    const started = await api()
      .post(`/api/v1/conversations/${c.id}/calls`)
      .set(c.attorney.auth)
      .expect(201);
    expect(started.body.data.status).toBe('ringing');
    const callId = started.body.data.id as string;
    return { c, callerSock, calleeSock, callId };
  }

  async function waitFor<T>(fn: () => Promise<T | null>, ms: number) {
    const until = Date.now() + ms;
    for (;;) {
      const v = await fn();
      if (v !== null || Date.now() > until) return v;
      await sleep(100);
    }
  }

  type Ended = { call: { id: string; status: string } };

  it('the caller app dies while ringing: canceled after the window, the callee hears it', async () => {
    const { calleeSock, callerSock, callId } = await ringingCall();
    const ended = new Promise<Ended>((resolve) =>
      calleeSock.on('call:ended', (p: Ended) => {
        if (p.call.id === callId) resolve(p);
      }),
    );
    const t0 = Date.now();
    callerSock.disconnect();
    const row = await waitFor(async () => {
      const r = await prisma.call.findUnique({ where: { id: callId } });
      return r && r.status !== 'ringing' ? r : null;
    }, 15_000);
    expect(row).toMatchObject({
      status: 'canceled',
      end_reason: 'caller_gone',
    });
    const took = Date.now() - t0;
    expect(took).toBeGreaterThanOrEqual(WINDOW_S * 1000 - 100);
    expect(took).toBeLessThan(15_000); // not the 65 s ring timeout
    expect((await ended).call.status).toBe('canceled');
  });

  it('the caller is back before the window ends: the call keeps ringing', async () => {
    const { c, callerSock, callId } = await ringingCall();
    callerSock.disconnect();
    // back on a new connection (the app reopened) inside the window
    await connect(c.attorney.token);
    await sleep(WINDOW_S * 1000 + 2_500);
    const row = await prisma.call.findUnique({ where: { id: callId } });
    expect(row?.status).toBe('ringing');
    await api()
      .post(`/api/v1/calls/${callId}/end`)
      .set(c.attorney.auth)
      .send({})
      .expect(200);
  });
});
