import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { FilesService } from '../src/modules/files/files.service';
import { CallsService } from '../src/modules/calls/calls.service';
import { FeatureFlagsService } from '../src/modules/feature-flags/services/feature-flags.service';

/**
 * OQ-041 (owner 2026-09-30): in-app audio calls — only after the bid is
 * accepted; ring → accept → WebRTC signaling relayed to the other member
 * only → hang up with a duration; decline, busy, missed (sweep); every
 * finished call lands in the chat log; blocks and strangers are refused;
 * STUN/TURN come with a short-lived TURN login.
 */
jest.setTimeout(120_000);

describe('In-app calls (e2e, OQ-041)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';
  const sockets: Socket[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.TURN_URLS = 'turn:turn.example.com:3478';
    process.env.TURN_SECRET = 'e2e-turn-secret';
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

  const callLog = (conversationId: string) =>
    prisma.message.findMany({
      where: { conversation_id: conversationId, type: 'call' },
      orderBy: { created_at: 'asc' },
    });

  it('rings, connects, relays signaling to the peer only, ends with a duration', async () => {
    const c = await chat();
    const clientSock = await connect(c.client.token);
    const attorneySock = await connect(c.attorney.token);

    const incoming = once<{ call: { id: string; outgoing: boolean } }>(
      clientSock,
      'call:incoming',
    );
    const started = await api()
      .post(`/api/v1/conversations/${c.id}/calls`)
      .set(c.attorney.auth)
      .expect(201);
    const callId = started.body.data.id as string;
    expect(started.body.data).toMatchObject({
      status: 'ringing',
      outgoing: true,
      peer: { kind: 'client', displayName: 'Cara Caller' },
    });
    const ring = await incoming;
    expect(ring.call).toMatchObject({ id: callId, outgoing: false });

    // The caller cannot start a second call meanwhile.
    const again = await api()
      .post(`/api/v1/conversations/${c.id}/calls`)
      .set(c.attorney.auth);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('CALL_IN_PROGRESS');

    // Only the callee can pick up.
    await api()
      .post(`/api/v1/calls/${callId}/accept`)
      .set(c.attorney.auth)
      .expect(404);
    const accepted = once<{ call: { status: string } }>(
      attorneySock,
      'call:accepted',
    );
    await api()
      .post(`/api/v1/calls/${callId}/accept`)
      .set(c.client.auth)
      .expect(200);
    expect((await accepted).call.status).toBe('active');

    // Signaling: offer to the callee; a stranger is refused.
    const gotOffer = once<{ callId: string; data: { type: string } }>(
      clientSock,
      'call:signal',
    );
    const ack = await attorneySock.timeout(5000).emitWithAck('call:signal', {
      callId,
      data: { type: 'offer', sdp: 'v=0' },
    });
    expect(ack).toEqual({ ok: true });
    expect(await gotOffer).toEqual({
      callId,
      data: { type: 'offer', sdp: 'v=0' },
      from: c.attorney.id,
    });
    const stranger = await prisma.user.create({
      data: { role: 'client', first_name: 'Eve', last_name: 'Drop' },
    });
    const eve = await connect(token(stranger.id, 'client'));
    const refused = await eve
      .timeout(5000)
      .emitWithAck('call:signal', { callId, data: { type: 'offer' } });
    expect(refused).toEqual({ ok: false });

    // Talk for a moment, then hang up.
    await prisma.call.update({
      where: { id: callId },
      data: { answered_at: new Date(Date.now() - 75_000) },
    });
    const ended = once<{ call: { status: string } }>(clientSock, 'call:ended');
    const end = await api()
      .post(`/api/v1/calls/${callId}/end`)
      .set(c.client.auth)
      .send({})
      .expect(200);
    expect(end.body.data.status).toBe('ended');
    expect(end.body.data.durationSec).toBeGreaterThanOrEqual(75);
    expect((await ended).call.status).toBe('ended');
    // Idempotent.
    await api()
      .post(`/api/v1/calls/${callId}/end`)
      .set(c.attorney.auth)
      .send({})
      .expect(200);

    const log = await callLog(c.id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      sender_id: c.attorney.id,
      body_display: 'ended',
    });
    const msgs = await api()
      .get(`/api/v1/conversations/${c.id}/messages`)
      .set(c.client.auth)
      .expect(200);
    const entry = (
      msgs.body.data as {
        type: string;
        call: { outcome: string; durationSec: number };
      }[]
    ).find((m) => m.type === 'call')!;
    expect(entry.call.outcome).toBe('ended');
    expect(entry.call.durationSec).toBeGreaterThanOrEqual(75);
  });

  it('the incoming call follows the callee’s view of the caller’s photo', async () => {
    const link = jest
      .spyOn(
        FilesService.prototype as unknown as {
          mediaUrlOf: () => Promise<string | null>;
        },
        'mediaUrlOf',
      )
      .mockResolvedValue('https://media.test/a.jpg');
    try {
      const c = await chat();
      const avatar = await prisma.file.create({
        data: {
          owner_user_id: c.attorney.id,
          purpose: 'avatar',
          s3_bucket: process.env.S3_BUCKET_MEDIA ?? 'lawbid-media',
          s3_key: `avatars/${c.attorney.id}/${randomUUID()}.jpg`,
          mime: 'image/jpeg',
          size_bytes: 10n,
          sha256: 'd'.repeat(64),
          scan_status: 'clean',
        },
      });
      await prisma.user.update({
        where: { id: c.attorney.id },
        data: { avatar_file_id: avatar.id },
      });
      await prisma.userPrivacySettings.create({
        data: { user_id: c.attorney.id, photo_from: 'nobody' },
      });
      const clientSock = await connect(c.client.token);
      const incoming = once<{ call: { peer: { avatarUrl: string | null } } }>(
        clientSock,
        'call:incoming',
      );
      await api()
        .post(`/api/v1/conversations/${c.id}/calls`)
        .set(c.attorney.auth)
        .expect(201);
      // The caller sees their own photo rules, the callee gets initials.
      expect((await incoming).call.peer.avatarUrl).toBeNull();
    } finally {
      link.mockRestore();
    }
  });

  it('a call is never left blocking: the end frees both at once, a silent one is closed (owner 2026-10-20)', async () => {
    const c = await chat();
    const first = await api()
      .post(`/api/v1/conversations/${c.id}/calls`)
      .set(c.client.auth)
      .expect(201);
    await api()
      .post(`/api/v1/calls/${first.body.data.id}/accept`)
      .set(c.attorney.auth)
      .expect(200);
    await api()
      .post(`/api/v1/calls/${first.body.data.id}/end`)
      .set(c.client.auth)
      .send({})
      .expect(200);
    // Straight after the hang-up the same pair can call again, both ways.
    const again = await api()
      .post(`/api/v1/conversations/${c.id}/calls`)
      .set(c.attorney.auth)
      .expect(201);
    expect(again.body.data.status).toBe('ringing');
    await api()
      .post(`/api/v1/calls/${again.body.data.id}/end`)
      .set(c.attorney.auth)
      .send({})
      .expect(200);

    // A call whose apps went silent (the end request was lost, both phones
    // gone) is over: asking for it is a heartbeat, silence is closed.
    const stuck = await prisma.call.create({
      data: {
        conversation_id: c.id,
        caller_id: c.client.id,
        callee_id: c.attorney.id,
        status: 'active',
        answered_at: new Date(Date.now() - 600_000),
        video: true,
      },
    });
    await prisma.$executeRaw`UPDATE calls SET updated_at = now() - interval '4 minutes' WHERE id = ${stuck.id}::uuid`;
    const fresh = await api()
      .post(`/api/v1/conversations/${c.id}/calls`)
      .set(c.client.auth)
      .expect(201);
    expect(fresh.body.data.status).toBe('ringing');
    expect(
      (await prisma.call.findUniqueOrThrow({ where: { id: stuck.id } })).status,
    ).toBe('ended');

    // An answered call that keeps being read stays up.
    await api()
      .post(`/api/v1/calls/${fresh.body.data.id}/accept`)
      .set(c.attorney.auth)
      .expect(200);
    await api()
      .get(`/api/v1/calls/${fresh.body.data.id}`)
      .set(c.client.auth)
      .expect(200);
    await app.get(CallsService).sweep();
    expect(
      (
        await prisma.call.findUniqueOrThrow({
          where: { id: fresh.body.data.id },
        })
      ).status,
    ).toBe('active');
  });

  it('decline, busy and missed (sweep) are logged; missed notifies the callee', async () => {
    const c = await chat();
    const r1 = await api()
      .post(`/api/v1/conversations/${c.id}/calls`)
      .set(c.client.auth)
      .expect(201);
    await api()
      .post(`/api/v1/calls/${r1.body.data.id}/decline`)
      .set(c.attorney.auth)
      .expect(200);

    // The attorney is talking in another chat → "busy".
    const other = await chat();
    const live = await prisma.call.create({
      data: {
        conversation_id: other.id,
        caller_id: other.client.id,
        callee_id: c.attorney.id,
        status: 'active',
        answered_at: new Date(),
      },
    });
    const busy = await api()
      .post(`/api/v1/conversations/${c.id}/calls`)
      .set(c.client.auth)
      .expect(201);
    expect(busy.body.data.status).toBe('busy');
    await prisma.call.update({
      where: { id: live.id },
      data: { status: 'ended', ended_at: new Date() },
    });

    // Nobody answers for over a minute → missed.
    const r3 = await api()
      .post(`/api/v1/conversations/${c.id}/calls`)
      .set(c.client.auth)
      .expect(201);
    await prisma.call.update({
      where: { id: r3.body.data.id },
      data: { created_at: new Date(Date.now() - 120_000) },
    });
    await app.get(CallsService).sweep();
    const missed = await api()
      .get(`/api/v1/calls/${r3.body.data.id}`)
      .set(c.attorney.auth)
      .expect(200);
    expect(missed.body.data.status).toBe('missed');
    expect(
      await prisma.notification.count({
        where: { user_id: c.attorney.id, type: 'missed_call' },
      }),
    ).toBe(2); // the busy call and the unanswered one

    expect((await callLog(c.id)).map((m) => m.body_display)).toEqual([
      'declined',
      'busy',
      'missed',
    ]);
  });

  it('refused before acceptance, when blocked, and for strangers', async () => {
    const locked = await chat(false);
    const r = await api()
      .post(`/api/v1/conversations/${locked.id}/calls`)
      .set(locked.client.auth);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('CALL_NOT_ALLOWED');

    const c = await chat();
    await prisma.userBlock.create({
      data: { blocker_id: c.client.id, blocked_id: c.attorney.id },
    });
    const b = await api()
      .post(`/api/v1/conversations/${c.id}/calls`)
      .set(c.attorney.auth);
    expect(b.status).toBe(403);
    expect(b.body.error.code).toBe('USER_BLOCKED');

    const stranger = await prisma.user.create({
      data: { role: 'client', first_name: 'No', last_name: 'One' },
    });
    await api()
      .post(`/api/v1/conversations/${c.id}/calls`)
      .set(bearer(token(stranger.id, 'client')))
      .expect(404);
  });

  it('gives STUN and a short-lived TURN login', async () => {
    const c = await chat();
    const res = await api()
      .get('/api/v1/calls/ice-servers')
      .set(c.client.auth)
      .expect(200);
    const servers = res.body.data.iceServers as {
      urls: string[];
      username: string | null;
      credential: string | null;
    }[];
    expect(servers[0].urls[0]).toMatch(/^stun:/);
    const turn = servers.find((s) => s.urls[0].startsWith('turn:'))!;
    expect(turn.username).toMatch(new RegExp(`^\\d+:${c.client.id}$`));
    expect(turn.credential).toBeTruthy();
  });

  /** T1 (audit 2026-10-26): the phone-side failover rides this wire —
   * GET /calls/ice-servers?relayFailed=true through the real query DTO
   * (whitelist + forbidNonWhitelisted) and the 30-a-minute throttle. */
  describe('GET /calls/ice-servers?relayFailed (T1)', () => {
    it('relayFailed=true: 200 with our own TURN login', async () => {
      const c = await chat();
      const res = await api()
        .get('/api/v1/calls/ice-servers?relayFailed=true')
        .set(c.client.auth)
        .expect(200);
      const servers = res.body.data.iceServers as {
        urls: string[];
        username: string | null;
      }[];
      const turn = servers.find((s) => s.urls[0].startsWith('turn:'))!;
      expect(turn.username).toMatch(new RegExp(`^\\d+:${c.client.id}$`));
      await api()
        .get('/api/v1/calls/ice-servers?relayFailed=false')
        .set(c.client.auth)
        .expect(200);
    });

    it('anything but true / false, or an unknown field, is refused', async () => {
      const c = await chat();
      await api()
        .get('/api/v1/calls/ice-servers?relayFailed=maybe')
        .set(c.client.auth)
        .expect(400);
      await api()
        .get('/api/v1/calls/ice-servers?bogus=1')
        .set(c.client.auth)
        .expect(400);
    });

    it('a looping phone is held at 30 a minute', async () => {
      const c = await chat();
      const codes: number[] = [];
      for (let i = 0; i < 31; i++) {
        codes.push(
          (
            await api()
              .get('/api/v1/calls/ice-servers?relayFailed=true')
              .set(c.client.auth)
          ).status,
        );
      }
      expect(codes.slice(0, 30).every((s) => s === 200)).toBe(true);
      expect(codes[30]).toBe(429);
    });
  });

  describe('video calls (owner 2026-10-05)', () => {
    async function setVideoFlag(enabled: boolean): Promise<void> {
      await prisma.featureFlag.upsert({
        where: { key: 'video_calls' },
        create: { key: 'video_calls', enabled },
        update: { enabled },
      });
      await app.get(FeatureFlagsService).invalidate();
    }

    afterAll(() => setVideoFlag(false));

    it('is refused while the video_calls flag is off; audio still rings', async () => {
      await setVideoFlag(false);
      const c = await chat();
      const cfg = await api()
        .get('/api/v1/calls/video')
        .set(c.client.auth)
        .expect(200);
      expect(cfg.body.data).toEqual({
        available: false,
        provider: 'webrtc',
        reason: 'flag_off',
      });
      const res = await api()
        .post(`/api/v1/conversations/${c.id}/calls`)
        .set(c.attorney.auth)
        .send({ video: true });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FEATURE_DISABLED');
      const audio = await api()
        .post(`/api/v1/conversations/${c.id}/calls`)
        .set(c.attorney.auth)
        .expect(201);
      expect(audio.body.data.video).toBe(false);
      await api()
        .post(`/api/v1/calls/${audio.body.data.id}/end`)
        .set(c.attorney.auth)
        .send({})
        .expect(200);
    });

    it('rings the callee as a video call once the flag is on', async () => {
      await setVideoFlag(true);
      const c = await chat();
      const cfg = await api()
        .get('/api/v1/calls/video')
        .set(c.client.auth)
        .expect(200);
      expect(cfg.body.data).toMatchObject({ available: true, reason: null });
      const clientSock = await connect(c.client.token);
      const incoming = once<{ call: { video: boolean } }>(
        clientSock,
        'call:incoming',
      );
      const res = await api()
        .post(`/api/v1/conversations/${c.id}/calls`)
        .set(c.attorney.auth)
        .send({ video: true })
        .expect(201);
      expect(res.body.data).toMatchObject({ status: 'ringing', video: true });
      expect((await incoming).call.video).toBe(true);
      const row = await prisma.call.findUniqueOrThrow({
        where: { id: res.body.data.id as string },
      });
      expect(row.video).toBe(true);
      await api()
        .post(`/api/v1/calls/${row.id}/end`)
        .set(c.attorney.auth)
        .send({})
        .expect(200);
    });
  });
});
