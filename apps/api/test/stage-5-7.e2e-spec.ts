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
 * docs/05 §16 stage 5.7 acceptance: a repeated clientMessageId makes no
 * duplicate; phone/email/link are masked before unlock (spelled-out too)
 * and not after; a closed chat takes no messages; two API instances
 * deliver events to each other through Redis; after a socket drop the
 * client gets what it missed over REST.
 */
jest.setTimeout(120_000);

describe('Chats and realtime (e2e, docs/05 §8, stage 5.7)', () => {
  let a: INestApplication;
  let b: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let urlA = '';
  let urlB = '';
  const sockets: Socket[] = [];

  async function boot(): Promise<[INestApplication, string]> {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    const port = ((app.getHttpServer() as Server).address() as AddressInfo)
      .port;
    return [app, `http://127.0.0.1:${port}`];
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    [a, urlA] = await boot();
    [b, urlB] = await boot();
    prisma = a.get(PrismaService);
    tokens = a.get(TokenService);
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await a.close();
    await b.close();
  });

  function token(id: string, role: 'client' | 'attorney') {
    return tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    });
  }

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function chat(opts: { unlocked?: boolean } = {}) {
    const client = await prisma.user.create({
      data: { role: 'client', first_name: 'Anna', last_name: 'Kim' },
    });
    const attorney = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Saul', last_name: 'Goodman' },
    });
    await prisma.attorneyProfile.create({
      data: {
        user_id: attorney.id,
        username: `att_${attorney.id.slice(0, 8)}`,
        username_lower: `att_${attorney.id.slice(0, 8)}`,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    // docs/06 §1.2: an active subscription (stage 6.7).
    await prisma.subscription.create({
      data: { user_id: attorney.id, status: 'active', price_cents: 39900 },
    });
    const parent = await prisma.practiceArea.upsert({
      where: { code: 'chat_e2e' },
      create: {
        code: 'chat_e2e',
        name_en: 'Chat e2e',
        i18n_key: 'practice.chat_e2e',
        sort: 0,
      },
      update: {},
    });
    const area = await prisma.practiceArea.upsert({
      where: { code: 'chat_e2e.leaf' },
      create: {
        code: 'chat_e2e.leaf',
        parent_id: parent.id,
        name_en: 'Leaf',
        i18n_key: 'practice.chat_e2e.leaf',
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
        title: 'Speeding ticket on the turnpike',
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
        status: opts.unlocked ? 'active' : 'pre_acceptance',
        contacts_unlocked: opts.unlocked ?? false,
        participants: {
          create: [{ user_id: client.id }, { user_id: attorney.id }],
        },
      },
    });
    const cTok = token(client.id, 'client');
    const aTok = token(attorney.id, 'attorney');
    return {
      caseId: kase.id,
      id: conv.id,
      client: { id: client.id, token: cTok, auth: bearer(cTok) },
      attorney: { id: attorney.id, token: aTok, auth: bearer(aTok) },
    };
  }

  const send = (
    base: string,
    auth: Record<string, string>,
    id: string,
    body: string,
    clientMessageId = randomUUID(),
  ) =>
    request(base)
      .post(`/api/v1/conversations/${id}/messages`)
      .set(auth)
      .send({ clientMessageId, body });

  function connect(base: string, t: string): Promise<Socket> {
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

  it('a repeated clientMessageId does not create a duplicate', async () => {
    const c = await chat();
    const key = randomUUID();
    const first = await send(urlA, c.attorney.auth, c.id, 'Hello', key);
    const again = await send(urlA, c.attorney.auth, c.id, 'Hello', key);
    expect(first.status).toBe(201);
    expect(again.status).toBe(201);
    expect(again.body.data.id).toBe(first.body.data.id);
    expect(
      await prisma.message.count({ where: { conversation_id: c.id } }),
    ).toBe(1);
  });

  it('masks contacts before unlock (spelled-out too), not after', async () => {
    const c = await chat();
    for (const body of [
      'call five five five one two three four',
      'mail me: anna@example.com',
      'see https://example.com/me',
    ]) {
      const r = await send(urlA, c.client.auth, c.id, body);
      expect(r.body.data.contactMasked).toBe(true);
      expect(r.body.data.body).toContain('[контакт скрыт]');
    }
    const stored = await prisma.message.findFirstOrThrow({
      where: { conversation_id: c.id, body_original: { contains: '@' } },
    });
    expect(stored.body_original).toBe('mail me: anna@example.com');

    const open = await chat({ unlocked: true });
    const r = await send(urlA, open.client.auth, open.id, 'anna@example.com');
    expect(r.body.data).toMatchObject({
      contactMasked: false,
      body: 'anna@example.com',
    });
  });

  it('a closed chat takes no messages; closing the case posts "Кейс закрыт"', async () => {
    const c = await chat();
    await send(urlA, c.attorney.auth, c.id, 'Hi');
    const closed = await request(urlA)
      .post(`/api/v1/cases/${c.caseId}/close`)
      .set(c.client.auth);
    expect(closed.status).toBe(200);

    const conv = await request(urlA)
      .get(`/api/v1/conversations/${c.id}`)
      .set(c.attorney.auth);
    expect(conv.body.data).toMatchObject({
      status: 'closed',
      lastMessage: { type: 'system', body: 'case_closed' },
      counterpart: { kind: 'client', displayName: null, id: null },
    });
    const r = await send(urlA, c.attorney.auth, c.id, 'Still there?');
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('CONVERSATION_CLOSED');
  });

  it('events cross instances through Redis; missed messages come over REST', async () => {
    const c = await chat();
    // The client listens on instance B; the attorney writes through A.
    const sock = await connect(urlB, c.client.token);
    const got = new Promise<{ message: { body: string; id: string } }>(
      (resolve) => sock.once('message:new', resolve),
    );
    const sent = await send(urlA, c.attorney.auth, c.id, 'Across instances');
    const event = await got;
    expect(event.message.body).toBe('Across instances');

    // Socket drops; two messages arrive meanwhile; REST catch-up.
    sock.disconnect();
    await send(urlA, c.attorney.auth, c.id, 'missed 1');
    await send(urlA, c.attorney.auth, c.id, 'missed 2');
    const missed = await request(urlB)
      .get(`/api/v1/conversations/${c.id}/messages`)
      .query({ afterId: sent.body.data.id })
      .set(c.client.auth);
    expect((missed.body.data as { body: string }[]).map((m) => m.body)).toEqual(
      ['missed 1', 'missed 2'],
    );

    const list = await request(urlB)
      .get('/api/v1/conversations')
      .set(c.client.auth);
    const row = (list.body.data as { id: string; unreadCount: number }[]).find(
      (x) => x.id === c.id,
    );
    expect(row?.unreadCount).toBe(3);
    const read = await request(urlB)
      .post(`/api/v1/conversations/${c.id}/read`)
      .set(c.client.auth)
      .send({ lastReadMessageId: missed.body.data[1].id });
    expect(read.status).toBe(200);
    const after = await request(urlB)
      .get(`/api/v1/conversations/${c.id}`)
      .set(c.client.auth);
    expect(after.body.data.unreadCount).toBe(0);
  });

  it('only participants can open or join a conversation', async () => {
    const c = await chat();
    const other = await prisma.user.create({ data: { role: 'client' } });
    const t = token(other.id, 'client');
    const r = await request(urlA)
      .get(`/api/v1/conversations/${c.id}`)
      .set(bearer(t));
    expect(r.status).toBe(404);
    const sock = await connect(urlA, t);
    const ack = (await sock.emitWithAck('conversation:join', {
      conversationId: c.id,
    })) as { ok: boolean };
    expect(ack.ok).toBe(false);
  });
});
