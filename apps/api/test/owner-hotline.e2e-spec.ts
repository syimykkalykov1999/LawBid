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

    // WhatsApp-style: their ordinary direct chat, open for messages both
    // ways — but NOT accepted on the attorney's behalf (audit 17.11 #6):
    // contacts stay masked, so neither side has the 1:1 call button
    const conv = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    expect(conv).toMatchObject({
      client_id: caller.id,
      attorney_id: lawyer.id,
      case_id: null,
      contacts_unlocked: false,
      request_status: 'accepted',
      requested_by: caller.id,
      status: 'active',
    });
    await api()
      .get(`/api/v1/conversations/${conversationId}`)
      .set(lawyer.auth)
      .expect(200);
    // owner rule: an attorney never calls a client
    const lawyerCalls = await api()
      .post(`/api/v1/conversations/${conversationId}/calls`)
      .set(lawyer.auth)
      .send({});
    expect(lawyerCalls.status).toBe(409);
    expect(lawyerCalls.body.error.code).toBe('CALL_NOT_ALLOWED');
    // the client writes the follow-up…
    await api()
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set(caller.auth)
      .send({ body: 'Thank you, one more question', clientMessageId: 'hl-1' })
      .expect(201);
    // …and calls back through the hotline: the offer goes to THIS attorney
    // (he is still on the line), with «Взять» like any hotline call
    const back = once<{ requestId: string }>(lSock, 'hotline:offer');
    const cb = await api()
      .post('/api/v1/hotline/call-back')
      .set(caller.auth)
      .send({
        attorneyId: lawyer.id,
        languages: ['en'],
        topic: 'Follow-up',
      })
      .expect(201);
    expect((await back).requestId).toBe(cb.body.data.id);
    // a stranger cannot «call back» an attorney he never talked to
    const stranger = await client();
    await api()
      .post('/api/v1/hotline/call-back')
      .set(stranger.auth)
      .send({ attorneyId: lawyer.id, languages: ['en'], topic: 'x' })
      .expect(403);
    await api()
      .delete(`/api/v1/hotline/requests/${cb.body.data.id}`)
      .set(caller.auth)
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

  // ── audit 17.11, proved live (owner rule 17.11): two real accounts, real
  // sockets and HTTP against the running app on local Postgres + Valkey;
  // every time-based admin setting is shortened to seconds for the case and
  // put back afterwards (before → during → after in the PR body) ──────────

  describe('audit 17.11 — live, with the admin numbers shortened', () => {
    const SHORT = [
      'hotline.presence_ttl_sec',
      'hotline.client_ttl_sec',
      'hotline.queue_max_wait_sec',
      'hotline.notify_max_wait_sec',
      'hotline.notify_claim_sec',
      'hotline.notify_quiet_start_hour',
      'hotline.notify_quiet_end_hour',
      'hotline.access_check_beats',
      'hotline.mode',
    ];
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const beat = async (
      s: Socket,
    ): Promise<{ ok: boolean; line: boolean | null; resumable?: boolean }> => {
      await wait(1050); // the gateway ignores beats faster than 1 s
      return (await s.emitWithAck('hotline:heartbeat', {})) as {
        ok: boolean;
        line: boolean | null;
        resumable?: boolean;
      };
    };

    afterEach(async () => {
      // back to the defaults (nothing stored = the default)
      for (const key of SHORT) await setConfig(key, null);
      await setFlag(true);
      const left = await prisma.appConfig.count({
        where: { key: { in: SHORT } },
      });
      expect(left).toBe(0);
    });

    it('#3 presence 60 → 5 s: a socket drop (deploy) keeps the attorney; after the window he is off but resumes with his choice; «away» is off at once', async () => {
      await setConfig('hotline.presence_ttl_sec', 5);
      const lawyer = await attorney();
      let sock = await connect(lawyer.token);
      await goLine(lawyer);
      expect(await sock.emitWithAck('hotline:heartbeat', {})).toMatchObject({
        line: true,
      });
      sock.disconnect(); // the deploy closes every socket
      await wait(1500);
      await sweeper.sweep(redis, Date.now());
      expect((await hotline.lineView(lawyer.id, null)).online).toBe(true);
      sock = await connect(lawyer.token); // back within the window
      expect(await beat(sock)).toMatchObject({ ok: true, line: true });
      // now the app is killed: no socket for longer than the window
      sock.disconnect();
      const watcher = await connect(lawyer.token); // hears his events only
      const off = once<{ reason: string; resumable: boolean }>(
        watcher,
        'hotline:line',
      );
      await wait(5600);
      await sweeper.sweep(redis, Date.now());
      expect(await off).toMatchObject({ reason: 'lost', resumable: true });
      // the reopened screen: the heartbeat says «resumable», one event back
      sock = await connect(lawyer.token);
      expect(await beat(sock)).toMatchObject({ line: false, resumable: true });
      expect(await sock.emitWithAck('hotline:resume', {})).toEqual({
        ok: true,
        line: true,
      });
      expect(await hotline.lineView(lawyer.id, null)).toMatchObject({
        online: true,
        states: ['CA'],
        practiceAreas: ['hotline_e2e'],
      });
      // REST twin of the same path
      await api()
        .post('/api/v1/hotline/line/resume')
        .set(lawyer.auth)
        .expect(200);
      // leaving the section = off at once, nothing kept
      await sock.emitWithAck('hotline:away', {});
      expect((await hotline.lineView(lawyer.id, null)).online).toBe(false);
      const r = await api()
        .post('/api/v1/hotline/line/resume')
        .set(lawyer.auth)
        .expect(200);
      expect(r.body.data.online).toBe(false);
    });

    it('#2 (P1) presence 60 → 5 s: both phones gone after ~2 s of talk → billed ~2 s, not 2 + 5 s', async () => {
      await setConfig('hotline.presence_ttl_sec', 5);
      const lawyer = await attorney();
      const caller = await client();
      const lSock = await connect(lawyer.token);
      const cSock = await connect(caller.token);
      await goLine(lawyer);
      await lSock.emitWithAck('hotline:heartbeat', {});
      const id = (await ask(caller)).body.data.id as string;
      await api()
        .post(`/api/v1/hotline/offers/${id}/accept`)
        .set(lawyer.auth)
        .expect(200);
      await beat(cSock);
      await beat(lSock); // ~2 s into the call: the last sign of life
      lSock.disconnect();
      cSock.disconnect();
      await wait(5600);
      await sweeper.sweep(redis, Date.now());
      const row = await prisma.hotlineCall.findUniqueOrThrow({
        where: { request_id: id },
      });
      expect(row.end_reason).toBe('lost');
      expect(row.duration_sec).toBeGreaterThanOrEqual(1);
      expect(row.duration_sec).toBeLessThanOrEqual(3);
    });

    it('#2 (P2) the switch off while the call is hung up on the call screen → after «on» the call’s own seconds, not the whole gap', async () => {
      const lawyer = await attorney();
      const caller = await client();
      const lSock = await connect(lawyer.token);
      await goLine(lawyer);
      await lSock.emitWithAck('hotline:heartbeat', {});
      const id = (await ask(caller)).body.data.id as string;
      const take = await api()
        .post(`/api/v1/hotline/offers/${id}/accept`)
        .set(lawyer.auth)
        .expect(200);
      await setFlag(false);
      await redis.del('hl:{hl}:tick');
      expect(await sweeper.tick()).toBe(false); // off: nothing runs
      await wait(1100);
      await api()
        .post(`/api/v1/calls/${take.body.data.callId as string}/end`)
        .set(caller.auth)
        .send({})
        .expect(200);
      await wait(4000); // the gap
      await setFlag(true);
      await redis.del('hl:{hl}:tick');
      expect(await sweeper.tick()).toBe(true);
      const call = await prisma.call.findUniqueOrThrow({
        where: { id: take.body.data.callId as string },
      });
      const row = await prisma.hotlineCall.findUniqueOrThrow({
        where: { request_id: id },
      });
      expect(row.end_reason).toBe('ended');
      expect(row.duration_sec).toBe(call.duration_sec);
      expect(row.duration_sec).toBeLessThanOrEqual(2);
    });

    it('#5 (P7) two «Взять» at the same instant → one call row, one id', async () => {
      const lawyer = await attorney();
      const caller = await client();
      const lSock = await connect(lawyer.token);
      await goLine(lawyer);
      await lSock.emitWithAck('hotline:heartbeat', {});
      const id = (await ask(caller)).body.data.id as string;
      const [a, b] = await Promise.all([
        api().post(`/api/v1/hotline/offers/${id}/accept`).set(lawyer.auth),
        api().post(`/api/v1/hotline/offers/${id}/accept`).set(lawyer.auth),
      ]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(a.body.data.callId).toBe(b.body.data.callId);
      expect(
        await prisma.call.count({
          where: { caller_id: caller.id, callee_id: lawyer.id },
        }),
      ).toBe(1);
    });

    it('#4 (P9) access re-check every 2 beats: «Выкл для всех» while waiting → off with the reason', async () => {
      await setConfig('hotline.access_check_beats', 2);
      const lawyer = await attorney();
      const lSock = await connect(lawyer.token);
      await goLine(lawyer);
      await lSock.emitWithAck('hotline:heartbeat', {});
      await setConfig('hotline.mode', 'off_for_all');
      const off = once<{ reason: string; detail: string }>(
        lSock,
        'hotline:line',
      );
      await beat(lSock);
      await beat(lSock);
      expect(await off).toMatchObject({
        reason: 'access',
        detail: 'off_for_all',
      });
      expect((await hotline.lineView(lawyer.id, null)).online).toBe(false);
    });

    it('#8 (P4) queue wait 1800 → 3 s: an online waiter is closed «queue_timeout»', async () => {
      await setConfig('hotline.queue_max_wait_sec', 3);
      const caller = await client();
      const cSock = await connect(caller.token);
      const id = (await ask(caller)).body.data.id as string;
      await beat(cSock);
      await beat(cSock);
      await wait(1200);
      await beat(cSock);
      await sweeper.sweep(redis, Date.now());
      const v = await api()
        .get(`/api/v1/hotline/requests/${id}`)
        .set(caller.auth)
        .expect(200);
      expect(v.body.data).toMatchObject({
        status: 'cancelled',
        endReason: 'queue_timeout',
      });
      expect(v.headers['cache-control']).toBe('private, max-age=5');
    });

    it('«Сообщите мне» 24 h → 3 s: the subscription ends «notify_expired»', async () => {
      await setConfig('hotline.notify_max_wait_sec', 3);
      const caller = await client();
      const id = (await ask(caller)).body.data.id as string;
      await api()
        .post(`/api/v1/hotline/requests/${id}/notify-me`)
        .set(caller.auth)
        .send({ timeZone: 'UTC', allowNight: true })
        .expect(200);
      await wait(3200);
      await sweeper.sweep(redis, Date.now());
      const v = await api()
        .get(`/api/v1/hotline/requests/${id}`)
        .set(caller.auth)
        .expect(200);
      expect(v.body.data).toMatchObject({
        status: 'cancelled',
        endReason: 'notify_expired',
      });
    });

    it('#10 (P6) claim window 60 → 5 s: two notices; a tap on the OLDER one still works', async () => {
      await setConfig('hotline.notify_claim_sec', 5);
      const caller = await client();
      const cSock = await connect(caller.token);
      const id = (await ask(caller)).body.data.id as string;
      await api()
        .post(`/api/v1/hotline/requests/${id}/notify-me`)
        .set(caller.auth)
        .send({ timeZone: 'UTC', allowNight: true })
        .expect(200);
      const lawyer = await attorney();
      const lSock = await connect(lawyer.token);
      await goLine(lawyer);
      await lSock.emitWithAck('hotline:heartbeat', {});
      const n1 = once<{ token: string }>(cSock, 'hotline:notify');
      await sweeper.sweep(redis, Date.now());
      const first = (await n1).token;
      await wait(5200); // the first notice ran out, the attorney is free
      await beat(lSock);
      const n2 = once<{ token: string }>(cSock, 'hotline:notify');
      await sweeper.sweep(redis, Date.now()); // the notice expires
      await sweeper.sweep(redis, Date.now()); // the bucket is looked at again
      expect((await n2).token).not.toBe(first);
      const offer = once<{ requestId: string }>(lSock, 'hotline:offer');
      const v = await api()
        .post(`/api/v1/hotline/requests/${id}/claim`)
        .set(caller.auth)
        .send({ token: first })
        .expect(200);
      expect(v.body.data.status).not.toBe('cancelled');
      expect((await offer).requestId).toBe(id);
    });

    it('#7 (P5a) night window = the hour now in California: no zone sent → the request’s state zone, no notice; «можно ночью» → notice', async () => {
      const hourLA = Number(
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Los_Angeles',
          hour: '2-digit',
          hourCycle: 'h23',
        }).format(new Date()),
      );
      await setConfig('hotline.notify_quiet_start_hour', hourLA);
      await setConfig('hotline.notify_quiet_end_hour', (hourLA + 1) % 24);
      const sleeper = await client();
      const sSock = await connect(sleeper.token);
      const night = (await ask(sleeper)).body.data.id as string;
      await api()
        .post(`/api/v1/hotline/requests/${night}/notify-me`)
        .set(sleeper.auth)
        .send({}) // the phone sent no zone, the account has none
        .expect(200);
      const owl = await client();
      const oSock = await connect(owl.token);
      const ok = (await ask(owl)).body.data.id as string;
      await api()
        .post(`/api/v1/hotline/requests/${ok}/notify-me`)
        .set(owl.auth)
        .send({ allowNight: true })
        .expect(200);
      let woke = false;
      sSock.on('hotline:notify', () => (woke = true));
      const n = once<{ requestId: string }>(oSock, 'hotline:notify');
      const lawyer = await attorney();
      const lSock = await connect(lawyer.token);
      await goLine(lawyer);
      await lSock.emitWithAck('hotline:heartbeat', {});
      await sweeper.sweep(redis, Date.now());
      expect((await n).requestId).toBe(ok);
      await wait(500);
      expect(woke).toBe(false);
    });

    it('#11 the disclosure counts as seen only after «Понятно»', async () => {
      const caller = await client();
      const before = await api()
        .get('/api/v1/hotline/config')
        .set(caller.auth)
        .expect(200);
      expect(before.body.data.disclosure.kind).toBe('full');
      await ask(caller); // the answer carried the text — not «seen» yet
      const still = await api()
        .get('/api/v1/hotline/config')
        .set(caller.auth)
        .expect(200);
      expect(still.body.data.disclosure.kind).toBe('full');
      await api()
        .post('/api/v1/hotline/disclosure/ack')
        .set(caller.auth)
        .send({ version: before.body.data.disclosure.version })
        .expect(200);
      const after = await api()
        .get('/api/v1/hotline/config')
        .set(caller.auth)
        .expect(200);
      expect(after.body.data.disclosure.key).toBeNull();
    });
  });
});
