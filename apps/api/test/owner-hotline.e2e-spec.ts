import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { TokenService } from '../src/modules/auth/services/token.service';
import { CallsService } from '../src/modules/calls/calls.service';
import { FeatureFlagsService } from '../src/modules/feature-flags/services/feature-flags.service';
import { dropAppConfigCache } from '../src/modules/feature-flags/services/app-config.service';
import { HotlineService } from '../src/modules/hotline/hotline.service';
import { HotlineSweeper } from '../src/modules/hotline/hotline-sweeper.service';

/**
 * Owner row 87, hotline plan PR 4 — the call bridge, end to end without
 * phones: two real sockets (client + attorney) on `/realtime` and the HTTP
 * API. The attorney waits («Ожидать звонки»), the client asks, the offer
 * reaches the attorney's socket, «Взять» opens a REAL 1:1 call (audio only,
 * device to device), its ICE servers are Cloudflare's (as for 1:1), the
 * WebRTC signaling goes through `call:signal`, «Конец» ends the call, the
 * billing row counts from «Взять», and the two land in their ordinary
 * direct chat. Then: a call hung up on the CALL screen ends the hotline
 * call too, and 3 unanswered offers take the attorney off the line.
 * Cloudflare's HTTP API is mocked (no packet leaves the machine).
 */
jest.setTimeout(120_000);

const CF_KEYS = ['turn', 'sfu'].flatMap((p) =>
  [
    'fail',
    'open',
    'probe',
    'lastprobe',
    'use',
    'report',
    'relayfail',
    'verify',
    'okprobe',
  ].map((k) => `calls:cf:${k}:${p}`),
);

describe('Hotline: «Взять» → a real 1:1 voice call (e2e, plan PR 4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let redis: Redis;
  let hotline: HotlineService;
  let sweeper: HotlineSweeper;
  let base = '';
  const sockets: Socket[] = [];
  const realFetch = globalThis.fetch;
  const savedEnv = {
    CLOUDFLARE_TURN_KEY_ID: process.env.CLOUDFLARE_TURN_KEY_ID,
    CLOUDFLARE_TURN_API_TOKEN: process.env.CLOUDFLARE_TURN_API_TOKEN,
  };
  const goodCheck = () =>
    Promise.resolve({
      target: 'turn.cloudflare.com:3478',
      stun: { ok: true, ms: 5 },
      turn: { ok: true, ms: 7 },
    });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.CLOUDFLARE_TURN_KEY_ID = 'test-hotline-cf-key-id';
    process.env.CLOUDFLARE_TURN_API_TOKEN = 'test-hotline-cf-token';
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          input instanceof Request
            ? input.url
            : input instanceof URL
              ? input.href
              : String(input);
        if (!url.startsWith('https://rtc.live.cloudflare.com/')) {
          return realFetch(input, init);
        }
        return Promise.resolve(
          Response.json(
            {
              iceServers: [
                {
                  urls: [
                    'stun:stun.cloudflare.com:3478',
                    'turn:turn.cloudflare.com:3478?transport=udp',
                    'turns:turn.cloudflare.com:5349?transport=tcp',
                  ],
                  username: `cf-${randomUUID().slice(0, 8)}`,
                  credential: 'test-cf-credential',
                },
              ],
            },
            { status: 201 },
          ),
        );
      });
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
    redis = app.get<Redis>(REDIS_CLIENT);
    hotline = app.get(HotlineService);
    sweeper = app.get(HotlineSweeper);
    // The relay's UDP check never leaves the machine (the calls e2e seam).
    type Seam = { relayCheck: typeof goodCheck };
    app.get<Seam>(CallsService).relayCheck = goodCheck;
    await prisma.integrationCredential.deleteMany({
      where: { provider: { in: ['cloudflare_turn', 'cloudflare_sfu'] } },
    });
    await redis.del(...CF_KEYS);
    await setFlag(true);
    await prisma.state.upsert({
      where: { code: 'CA' },
      create: { code: 'CA', name: 'California' },
      update: { is_active: true },
    });
    await prisma.practiceArea.upsert({
      where: { code: 'hotline_e2e' },
      create: {
        code: 'hotline_e2e',
        name_en: 'Hotline e2e',
        i18n_key: 'practice.hotline_e2e',
        sort: 0,
      },
      update: { is_active: true },
    });
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await setFlag(false);
    await redis.del(...CF_KEYS);
    await app.close();
    jest.restoreAllMocks();
    Object.assign(process.env, savedEnv);
  });

  beforeEach(async () => {
    // a clean hotline (one Valkey slot `{hl}`) per case
    const keys = await redis.keys('hl:{hl}*');
    if (keys.length) await redis.del(...keys);
    await setConfig('hotline.offer_timeout_sec', null);
  });

  async function setFlag(enabled: boolean): Promise<void> {
    await prisma.featureFlag.upsert({
      where: { key: 'hotline' },
      create: { key: 'hotline', enabled },
      update: { enabled },
    });
    await app.get(FeatureFlagsService).invalidate();
  }

  async function setConfig(key: string, value: unknown): Promise<void> {
    if (value === null) {
      await prisma.appConfig.deleteMany({ where: { key } });
    } else {
      await prisma.appConfig.upsert({
        where: { key },
        update: { value: value as never },
        create: { key, value: value as never },
      });
    }
    await dropAppConfigCache(redis);
  }

  const api = () => request(base);
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  interface Person {
    id: string;
    token: string;
    auth: Record<string, string>;
  }

  async function attorney(): Promise<Person> {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Hana', last_name: 'Line' },
    });
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username: `hl_${u.id.slice(0, 8)}`,
        username_lower: `hl_${u.id.slice(0, 8)}`,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    await prisma.attorneyLicense.create({
      data: {
        attorney_id: u.id,
        state_code: 'CA',
        bar_number: `CA-${u.id.slice(0, 6)}`,
        license_status: 'verified',
        verified_at: new Date(),
      },
    });
    const t = tokens.signAccessToken({
      sub: u.id,
      role: 'attorney',
      sid: randomUUID(),
      verified: true,
      subscriptionStatus: 'none',
    });
    return { id: u.id, token: t, auth: bearer(t) };
  }

  async function client(): Promise<Person> {
    const u = await prisma.user.create({
      data: {
        role: 'client',
        first_name: 'Cleo',
        last_name: 'Caller',
        phone_verified_at: new Date(),
      },
    });
    const t = tokens.signAccessToken({
      sub: u.id,
      role: 'client',
      sid: randomUUID(),
      verified: false,
      subscriptionStatus: 'none',
    });
    return { id: u.id, token: t, auth: bearer(t) };
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

  const once = <T>(s: Socket, event: string, ms = 15_000) =>
    new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`no ${event}`)), ms);
      s.once(event, (d: T) => {
        clearTimeout(t);
        resolve(d);
      });
    });

  const goLine = (a: Person) =>
    api()
      .put('/api/v1/hotline/line')
      .set(a.auth)
      .send({
        states: ['CA'],
        practiceAreas: ['hotline_e2e'],
        languages: ['en'],
      })
      .expect(200);

  const ask = (c: Person) =>
    api()
      .post('/api/v1/hotline/requests')
      .set(c.auth)
      .send({
        state: 'CA',
        practiceArea: 'hotline_e2e',
        languages: ['en'],
        topic: 'Custody papers',
      })
      .expect(201);

  type Ice = { urls: string[]; username: string | null };
  async function ice(p: Person) {
    const res = await api()
      .get('/api/v1/calls/ice-servers')
      .set(p.auth)
      .expect(200);
    return res.body.data as {
      iceServers: Ice[];
      iceTransportPolicy: string;
    };
  }

  it('offer → «Взять» → a real call (Cloudflare ICE, signaling) → «Конец» → billing row + direct chat', async () => {
    const lawyer = await attorney();
    const caller = await client();
    const lSock = await connect(lawyer.token);
    const cSock = await connect(caller.token);
    // the attorney's line socket: heartbeat binds the line to it
    await goLine(lawyer);
    expect(await lSock.emitWithAck('hotline:heartbeat', {})).toMatchObject({
      ok: true,
      line: true,
    });

    const offer = once<{ requestId: string; topic: string }>(
      lSock,
      'hotline:offer',
    );
    const created = await ask(caller);
    const requestId = created.body.data.id as string;
    expect((await offer).requestId).toBe(requestId);
    expect((await offer).topic).toBe('Custody papers');

    const connectedC = once<{ callId: string; video: boolean }>(
      cSock,
      'hotline:connected',
    );
    const take = await api()
      .post(`/api/v1/hotline/offers/${requestId}/accept`)
      .set(lawyer.auth)
      .expect(200);
    const callId = take.body.data.callId as string;
    expect(take.body.data).toMatchObject({ ok: true, state: 'connected' });
    expect(callId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await connectedC).toMatchObject({ callId, video: false });
    // «Взять» again: the same call, no second one
    const again = await api()
      .post(`/api/v1/hotline/offers/${requestId}/accept`)
      .set(lawyer.auth)
      .expect(200);
    expect(again.body.data.callId).toBe(callId);

    // the 1:1 call: active, answered, audio only, device to device, the
    // client calls the attorney; no chat was needed to start it
    const call = await prisma.call.findUniqueOrThrow({ where: { id: callId } });
    expect(call).toMatchObject({
      caller_id: caller.id,
      callee_id: lawyer.id,
      status: 'active',
      video: false,
      media_provider: 'p2p',
      conversation_id: null,
      is_group: false,
    });
    expect(call.answered_at).not.toBeNull();
    // both see it through the ordinary calls API
    const asClient = await api()
      .get(`/api/v1/calls/${callId}`)
      .set(caller.auth)
      .expect(200);
    expect(asClient.body.data).toMatchObject({
      status: 'active',
      video: false,
      outgoing: true,
      peer: { id: lawyer.id, kind: 'attorney' },
    });
    // the client's view carries the call id
    const view = await api()
      .get(`/api/v1/hotline/requests/${requestId}`)
      .set(caller.auth)
      .expect(200);
    expect(view.body.data).toMatchObject({ status: 'connected', callId });

    // ICE: Cloudflare only, relay policy — exactly as for a 1:1 call
    for (const p of [caller, lawyer]) {
      const servers = await ice(p);
      expect(servers.iceTransportPolicy).toBe('relay');
      const relays = servers.iceServers.filter((s) => s.username !== null);
      expect(relays.length).toBeGreaterThan(0);
      for (const r of relays) {
        expect(r.urls.every((u) => u.includes('cloudflare.com'))).toBe(true);
      }
    }

    // WebRTC signaling goes peer to peer through `call:signal`
    const got = once<{ callId: string; from: string; data: { sdp: string } }>(
      lSock,
      'call:signal',
    );
    expect(
      await cSock.emitWithAck('call:signal', {
        callId,
        data: { type: 'offer', sdp: 'v=0 test-offer' },
      }),
    ).toEqual({ ok: true });
    expect(await got).toMatchObject({
      callId,
      from: caller.id,
      data: { sdp: 'v=0 test-offer' },
    });

    // «Конец» on the hotline (either side): both get call:ended and
    // hotline:ended, the call row is over
    await new Promise((r) => setTimeout(r, 1200)); // ≥ 1 billed second
    const callEnded = once<{ call: { id: string; status: string } }>(
      cSock,
      'call:ended',
    );
    const hlEnded = once<{
      seconds: number;
      conversationId: string;
      callId: string;
    }>(lSock, 'hotline:ended');
    const end = await api()
      .post(`/api/v1/hotline/calls/${requestId}/end`)
      .set(lawyer.auth)
      .expect(200);
    expect(end.body.data.ok).toBe(true);
    expect(end.body.data.seconds).toBeGreaterThanOrEqual(1);
    expect((await callEnded).call).toMatchObject({
      id: callId,
      status: 'ended',
    });
    const ended = await hlEnded;
    expect(ended.callId).toBe(callId);
    const conversationId = ended.conversationId;
    expect(conversationId).toBe(end.body.data.conversationId);

    // the billing row: from «Взять», the call's own seconds
    const row = await prisma.hotlineCall.findUniqueOrThrow({
      where: { request_id: requestId },
    });
    expect(row).toMatchObject({
      call_id: callId,
      client_id: caller.id,
      attorney_id: lawyer.id,
      state_code: 'CA',
      practice_area: 'hotline_e2e',
      end_reason: 'ended',
      conversation_id: conversationId,
    });
    expect(row.answered_at.getTime()).toBe(call.answered_at!.getTime());
    expect(row.duration_sec).toBe(end.body.data.seconds);
    expect(row.ended_at).not.toBeNull();

    // WhatsApp-style: their ordinary direct chat, open for both
    const conv = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    expect(conv).toMatchObject({
      client_id: caller.id,
      attorney_id: lawyer.id,
      case_id: null,
      contacts_unlocked: true,
      status: 'active',
    });
    await api()
      .get(`/api/v1/conversations/${conversationId}`)
      .set(lawyer.auth)
      .expect(200);
    // a second hotline call of the same pair reuses that chat
    // (startDirect finds the pair's one direct chat)
    expect(
      await prisma.conversation.count({
        where: {
          client_id: caller.id,
          attorney_id: lawyer.id,
          case_id: null,
        },
      }),
    ).toBe(1);
    // the client's view after the call
    const after = await api()
      .get(`/api/v1/hotline/requests/${requestId}`)
      .set(caller.auth)
      .expect(200);
    expect(after.body.data).toMatchObject({
      status: 'ended',
      callId: null,
      conversationId,
    });
  });

  it('hung up on the CALL screen (POST /calls/:id/end) → the sweeper ends the hotline call, billing = the call’s seconds', async () => {
    const lawyer = await attorney();
    const caller = await client();
    const lSock = await connect(lawyer.token);
    await goLine(lawyer);
    await lSock.emitWithAck('hotline:heartbeat', {});
    const requestId = (await ask(caller)).body.data.id as string;
    const take = await api()
      .post(`/api/v1/hotline/offers/${requestId}/accept`)
      .set(lawyer.auth)
      .expect(200);
    const callId = take.body.data.callId as string;
    await new Promise((r) => setTimeout(r, 1100));
    await api()
      .post(`/api/v1/calls/${callId}/end`)
      .set(caller.auth)
      .send({})
      .expect(200);
    const ended = once<{ reason: string; conversationId: string }>(
      lSock,
      'hotline:ended',
    );
    // the sync runs every hotline.call_sync_sec (2 s)
    await new Promise((r) => setTimeout(r, 2100));
    await sweeper.sweep(redis, Date.now());
    expect(await ended).toMatchObject({ reason: 'ended' });
    const call = await prisma.call.findUniqueOrThrow({ where: { id: callId } });
    const row = await prisma.hotlineCall.findUniqueOrThrow({
      where: { request_id: requestId },
    });
    expect(row.end_reason).toBe('ended');
    expect(row.duration_sec).toBe(call.duration_sec);
    expect(row.conversation_id).not.toBeNull();
    // the attorney is free again and back on the line
    const line = await api()
      .put('/api/v1/hotline/line')
      .set(lawyer.auth)
      .send({
        states: ['CA'],
        practiceAreas: ['hotline_e2e'],
        languages: ['en'],
      })
      .expect(200);
    expect(line.body.data).toMatchObject({ online: true, state: 'idle' });
  });

  it('10 s answer window (here 3 s) — 3 unanswered offers in a row → the attorney is off the line', async () => {
    await setConfig('hotline.offer_timeout_sec', 3);
    const lawyer = await attorney();
    const lSock = await connect(lawyer.token);
    await goLine(lawyer);
    await lSock.emitWithAck('hotline:heartbeat', {});
    const lineOff = once<{ online: boolean; reason: string }>(
      lSock,
      'hotline:line',
      30_000,
    );
    const timeouts: string[] = [];
    lSock.on('hotline:offer_ended', (d: { reason: string }) =>
      timeouts.push(d.reason),
    );
    for (let i = 0; i < 3; i++) {
      const offer = once<{ requestId: string }>(lSock, 'hotline:offer');
      const c = await client();
      const id = (await ask(c)).body.data.id as string;
      expect((await offer).requestId).toBe(id);
      await new Promise((r) => setTimeout(r, 3100));
      await sweeper.sweep(redis, Date.now());
    }
    expect(await lineOff).toMatchObject({ online: false, reason: 'missed' });
    expect(timeouts).toEqual(['timeout', 'timeout', 'timeout']);
    const v = await hotline.lineView(lawyer.id, null);
    expect(v.online).toBe(false);
    // no calls were opened for unanswered offers
    expect(await prisma.call.count({ where: { callee_id: lawyer.id } })).toBe(
      0,
    );
  });
});
