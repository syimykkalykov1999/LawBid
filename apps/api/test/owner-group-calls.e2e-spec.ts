import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-10-20: group calls. A member adds a person to the running call
 * (by id or username, only someone they can chat with); the person rings,
 * joins, signals peer to peer through the server; the host mutes or removes
 * members; hanging up leaves, and the call ends when fewer than two remain.
 */
jest.setTimeout(120_000);

describe('Group calls (e2e)', () => {
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
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await app.close();
  });

  const api = () => request(base);
  const parts = (res: { body: unknown }) =>
    (
      res.body as {
        data: { participants: { userId: string; status: string }[] };
      }
    ).data.participants;
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

  it('adds a person, relays signals per member, host mutes and removes, leaving ends the call below two', async () => {
    const client = await prisma.user.create({
      data: { role: 'client', first_name: 'Cora', last_name: 'Group' },
    });
    const a1 = await attorney('Alan');
    const a2 = await attorney('Bea');
    const stranger = await prisma.user.create({
      data: { role: 'client', first_name: 'Sam', last_name: 'Stranger' },
    });
    const conv1 = await chatBetween(client.id, a1.id);
    await chatBetween(client.id, a2.id);
    const cAuth = auth(client.id, 'client');
    const a1Auth = auth(a1.id, 'attorney');
    const a2Auth = auth(a2.id, 'attorney');

    const cSock = await connect(token(client.id, 'client'));
    const a1Sock = await connect(token(a1.id, 'attorney'));
    const a2Sock = await connect(token(a2.id, 'attorney'));

    // a1 calls the client, who picks up.
    const started = await api()
      .post(`/api/v1/conversations/${conv1}/calls`)
      .set(a1Auth)
      .expect(201);
    const callId = started.body.data.id as string;
    await api().post(`/api/v1/calls/${callId}/accept`).set(cAuth).expect(200);

    // A stranger cannot add anyone; a person the adder blocked is refused.
    await api()
      .post(`/api/v1/calls/${callId}/participants`)
      .set(auth(stranger.id, 'client'))
      .send({ userId: a2.id })
      .expect(404);
    await api()
      .put(`/api/v1/users/${stranger.id}/block`)
      .set(a1Auth)
      .expect(204);
    const blocked = await api()
      .post(`/api/v1/calls/${callId}/participants`)
      .set(a1Auth)
      .send({ userId: stranger.id });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('USER_BLOCKED');

    // a2's privacy "who can call me" = nobody: adding them is refused.
    await api()
      .put('/api/v1/users/me/privacy')
      .set(a2Auth)
      .send({ callFrom: 'nobody' })
      .expect(200);
    const hidden = await api()
      .post(`/api/v1/calls/${callId}/participants`)
      .set(cAuth)
      .send({ username: `@${a2.username}` });
    expect(hidden.status).toBe(403);
    expect(hidden.body.error.code).toBe('PRIVACY_RESTRICTED');
    await api()
      .put('/api/v1/users/me/privacy')
      .set(a2Auth)
      .send({ callFrom: 'everyone' })
      .expect(200);

    // The client adds a2 by username; a2 rings (the client is a2's chat).
    const ring = once<{ call: { id: string; group: boolean } }>(
      a2Sock,
      'call:incoming',
    );
    const list = once<{ participants: { status: string }[] }>(
      a1Sock,
      'call:participants',
    );
    const invited = await api()
      .post(`/api/v1/calls/${callId}/participants`)
      .set(cAuth)
      .send({ username: `@${a2.username}` })
      .expect(200);
    expect(invited.body.data.group).toBe(true);
    expect(invited.body.data.participants).toHaveLength(3);
    expect(invited.body.data.hostId).toBe(a1.id);
    expect((await ring).call).toMatchObject({ id: callId, group: true });
    expect((await list).participants.map((p) => p.status).sort()).toEqual([
      'invited',
      'joined',
      'joined',
    ]);

    // a2 picks up.
    const accepted = once<{ call: { status: string } }>(
      a2Sock,
      'call:accepted',
    );
    const joined = await api()
      .post(`/api/v1/calls/${callId}/accept`)
      .set(a2Auth)
      .expect(200);
    expect((await accepted).call.status).toBe('active');
    expect(
      parts(joined).filter((p: { status: string }) => p.status === 'joined'),
    ).toHaveLength(3);

    // Signals go to the named member only, carrying who sent them.
    const gotSignal = once<{ from: string; data: { type: string } }>(
      a1Sock,
      'call:signal',
    );
    const ack = await a2Sock.timeout(5000).emitWithAck('call:signal', {
      callId,
      to: a1.id,
      data: { type: 'offer', sdp: 'v=0' },
    });
    expect(ack).toEqual({ ok: true });
    expect(await gotSignal).toMatchObject({
      from: a2.id,
      data: { type: 'offer' },
    });
    const clientGot: unknown[] = [];
    cSock.on('call:signal', (m) => clientGot.push(m));
    await new Promise((r) => setTimeout(r, 300));
    expect(clientGot).toHaveLength(0);

    // Only the host (the caller, a1) mutes; the muted member hears it.
    await api()
      .post(`/api/v1/calls/${callId}/participants/${a2.id}/mute`)
      .set(cAuth)
      .send({ muted: true })
      .expect(403);
    const muted = once<{ muted: boolean; byUserId: string }>(
      a2Sock,
      'call:muted',
    );
    const m = await api()
      .post(`/api/v1/calls/${callId}/participants/${a2.id}/mute`)
      .set(a1Auth)
      .send({ muted: true })
      .expect(200);
    expect(await muted).toEqual({
      callId,
      muted: true,
      byUserId: a1.id,
    });
    expect(
      parts(m).find((p: { userId: string }) => p.userId === a2.id),
    ).toMatchObject({ muted: true, mutedByHost: true });
    // They may switch it back on themselves.
    const own = await api()
      .post(`/api/v1/calls/${callId}/mute-state`)
      .set(a2Auth)
      .send({ muted: false })
      .expect(200);
    expect(
      parts(own).find((p: { userId: string }) => p.userId === a2.id),
    ).toMatchObject({ muted: false, mutedByHost: false });

    // The host removes a2; the call goes on for the other two.
    const removed = once<{ callId: string }>(a2Sock, 'call:removed');
    const rm = await api()
      .delete(`/api/v1/calls/${callId}/participants/${a2.id}`)
      .set(a1Auth)
      .expect(200);
    expect(await removed).toEqual({ callId });
    expect(rm.body.data.status).toBe('active');
    expect(parts(rm).find((p) => p.userId === a2.id)?.status).toBe('removed');
    // a2 is free for another call now.
    const row = await prisma.callParticipant.findFirstOrThrow({
      where: { call_id: callId, user_id: a2.id },
    });
    expect(row.status).toBe('removed');
    // A removed person cannot be invited into this call again.
    await api()
      .post(`/api/v1/calls/${callId}/participants`)
      .set(cAuth)
      .send({ userId: a2.id })
      .expect(403);

    // The client leaves: fewer than two remain, so the call ends for all.
    const ended = once<{ call: { status: string } }>(a1Sock, 'call:ended');
    await api()
      .post(`/api/v1/calls/${callId}/end`)
      .set(cAuth)
      .send({})
      .expect(200);
    expect((await ended).call.status).toBe('ended');
    const call = await prisma.call.findUniqueOrThrow({ where: { id: callId } });
    expect(call.status).toBe('ended');
  });

  it('a stranger cannot be added to a call (goes through Requests first); people with a chat or in the phone book can, by @username or id', async () => {
    const client = await prisma.user.create({
      data: { role: 'client', first_name: 'Eve', last_name: 'Group' },
    });
    const a1 = await attorney('Eric');
    const loose = await attorney('Lena');
    const looseClient = await prisma.user.create({
      data: { role: 'client', first_name: 'Max', last_name: 'Loose' },
    });
    const conv1 = await chatBetween(client.id, a1.id);
    const a1Auth = auth(a1.id, 'attorney');

    const started = await api()
      .post(`/api/v1/conversations/${conv1}/calls`)
      .set(a1Auth)
      .expect(201);
    const callId = started.body.data.id as string;
    await api()
      .post(`/api/v1/calls/${callId}/accept`)
      .set(auth(client.id, 'client'))
      .expect(200);

    // Neither has a chat with anyone in the call: refused until they are
    // connected (owner 2026-10-21: strangers go through Requests first).
    const refused = await api()
      .post(`/api/v1/calls/${callId}/participants`)
      .set(a1Auth)
      .send({ username: `@${loose.username}` })
      .expect(403);
    expect((refused.body as { error: { code: string } }).error.code).toBe(
      'CALL_NOT_ALLOWED',
    );
    await prisma.contactMatch.createMany({
      data: [
        { owner_id: a1.id, matched_id: loose.id },
        { owner_id: looseClient.id, matched_id: a1.id },
      ],
    });
    const byName = await api()
      .post(`/api/v1/calls/${callId}/participants`)
      .set(a1Auth)
      .send({ username: `@${loose.username}` })
      .expect(200);
    expect(parts(byName).find((p) => p.userId === loose.id)?.status).toBe(
      'invited',
    );
    const byId = await api()
      .post(`/api/v1/calls/${callId}/participants`)
      .set(a1Auth)
      .send({ userId: looseClient.id })
      .expect(200);
    expect(parts(byId).find((p) => p.userId === looseClient.id)?.status).toBe(
      'invited',
    );
    await api()
      .post(`/api/v1/calls/${callId}/end`)
      .set(a1Auth)
      .send({})
      .expect(200);
  });

  it('a group call stays up while two or more remain, and a declined invite ends nothing', async () => {
    const client = await prisma.user.create({
      data: { role: 'client', first_name: 'Dora', last_name: 'Group' },
    });
    const a1 = await attorney('Carl');
    const a2 = await attorney('Dina');
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
    // a2 is busy with this call: a second call to them is "busy"; and they
    // decline the invite, which leaves the call as it was.
    await api().post(`/api/v1/calls/${callId}/decline`).set(a2Auth).expect(200);
    const after = await api()
      .get(`/api/v1/calls/${callId}`)
      .set(a1Auth)
      .expect(200);
    expect(after.body.data.status).toBe('active');
    expect(parts(after).find((p) => p.userId === a2.id)?.status).toBe(
      'declined',
    );

    // Re-invited, joined, then the original caller leaves: still two in.
    await api()
      .post(`/api/v1/calls/${callId}/participants`)
      .set(cAuth)
      .send({ userId: a2.id })
      .expect(200);
    await api().post(`/api/v1/calls/${callId}/accept`).set(a2Auth).expect(200);
    const leave = await api()
      .post(`/api/v1/calls/${callId}/end`)
      .set(a1Auth)
      .send({})
      .expect(200);
    expect(leave.body.data.status).toBe('active');
    const state = await api()
      .get(`/api/v1/calls/${callId}`)
      .set(cAuth)
      .expect(200);
    expect(state.body.data.hostId).toBe(client.id);
    // The client (new host) hangs up: one left, the call ends.
    await api()
      .post(`/api/v1/calls/${callId}/end`)
      .set(cAuth)
      .send({})
      .expect(200);
    const done = await prisma.call.findUniqueOrThrow({ where: { id: callId } });
    expect(done.status).toBe('ended');
  });

  it('a call made a group: whoever left comes back while it runs; a stranger cannot; looking does not keep it alive', async () => {
    const client = await prisma.user.create({
      data: { role: 'client', first_name: 'Ella', last_name: 'Group' },
    });
    const a1 = await attorney('Fred');
    const a2 = await attorney('Gina');
    const a3 = await attorney('Hugo');
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

    // a1 leaves; the call goes on with two.
    await api()
      .post(`/api/v1/calls/${callId}/end`)
      .set(a1Auth)
      .send({})
      .expect(200);
    // Looking at it (the «Return» bar) is not a heartbeat for the call.
    const before = await prisma.call.findUniqueOrThrow({
      where: { id: callId },
    });
    await new Promise((r) => setTimeout(r, 20));
    await api().get(`/api/v1/calls/${callId}`).set(a1Auth).expect(200);
    const looked = await prisma.call.findUniqueOrThrow({
      where: { id: callId },
    });
    expect(looked.updated_at.getTime()).toBe(before.updated_at.getTime());

    // a1 comes back.
    const back = await api()
      .post(`/api/v1/calls/${callId}/join`)
      .set(a1Auth)
      .expect(200);
    expect(parts(back).find((p) => p.userId === a1.id)?.status).toBe('joined');
    // A stranger to the call cannot walk in.
    await api()
      .post(`/api/v1/calls/${callId}/join`)
      .set(auth(a3.id, 'attorney'))
      .expect(404);
  });
});
