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
 * Owner 2026-10-01: "online / last seen" in chats — an open app makes a
 * person online for the people they chat with; closing it sets "last
 * seen"; live updates to a watcher; hidden both ways when either side
 * turns the activity status off (Instagram-like) or across a block.
 */
jest.setTimeout(120_000);

describe('Online / last seen (e2e, owner 2026-10-01)', () => {
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
  const token = (id: string, role: 'client' | 'attorney') =>
    tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    });

  async function chat() {
    const client = await prisma.user.create({
      data: { role: 'client', first_name: 'Olga', last_name: 'Online' },
    });
    const attorney = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Abe', last_name: 'Away' },
    });
    await prisma.attorneyProfile.create({
      data: {
        user_id: attorney.id,
        username: `pres_${attorney.id.slice(0, 8)}`,
        username_lower: `pres_${attorney.id.slice(0, 8)}`,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    const conv = await prisma.conversation.create({
      data: {
        client_id: client.id,
        attorney_id: attorney.id,
        status: 'active',
        contacts_unlocked: true,
        request_status: 'accepted',
        last_message_at: new Date(),
        participants: {
          create: [{ user_id: client.id }, { user_id: attorney.id }],
        },
      },
    });
    const c = token(client.id, 'client');
    const a = token(attorney.id, 'attorney');
    return {
      id: conv.id,
      client: {
        id: client.id,
        token: c,
        auth: { Authorization: `Bearer ${c}` },
      },
      attorney: {
        id: attorney.id,
        token: a,
        auth: { Authorization: `Bearer ${a}` },
      },
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

  const counterpart = async (auth: Record<string, string>, id: string) => {
    const res = await api().get('/api/v1/conversations').set(auth).expect(200);
    const list = res.body.data as {
      id: string;
      counterpart: { online: boolean | null; lastSeenAt: string | null };
    }[];
    return list.find((c) => c.id === id)!.counterpart;
  };

  const waitFor = async (check: () => Promise<boolean>) => {
    for (let i = 0; i < 40; i++) {
      if (await check()) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('timed out');
  };

  it('online while the app is open, last seen after, live to a watcher', async () => {
    const c = await chat();
    expect((await counterpart(c.client.auth, c.id)).online).toBe(false);

    const clientSock = await connect(c.client.token);
    const watch = (await clientSock.emitWithAck('presence:watch', {
      userId: c.attorney.id,
    })) as { ok: boolean; visible: boolean; online: boolean };
    expect(watch).toMatchObject({ ok: true, visible: true, online: false });

    const cameOnline = new Promise<{ online: boolean }>((resolve) =>
      clientSock.once('presence:update', resolve),
    );
    const attorneySock = await connect(c.attorney.token);
    expect((await cameOnline).online).toBe(true);
    expect((await counterpart(c.client.auth, c.id)).online).toBe(true);

    const wentAway = new Promise<{ online: boolean; lastSeenAt: string }>(
      (resolve) => clientSock.once('presence:update', resolve),
    );
    attorneySock.disconnect();
    const away = await wentAway;
    expect(away.online).toBe(false);
    expect(away.lastSeenAt).toBeTruthy();
    await waitFor(
      async () => (await counterpart(c.client.auth, c.id)).lastSeenAt !== null,
    );
  });

  it('hidden both ways when one side turns the activity status off', async () => {
    const c = await chat();
    await connect(c.attorney.token);
    await waitFor(
      async () => (await counterpart(c.client.auth, c.id)).online === true,
    );
    const off = await api()
      .put('/api/v1/users/me/activity-status')
      .set(c.attorney.auth)
      .send({ showActivityStatus: false })
      .expect(200);
    expect(off.body.data.showActivityStatus).toBe(false);
    expect((await counterpart(c.client.auth, c.id)).online).toBeNull();
    // Reciprocal: the attorney no longer sees the client either.
    await connect(c.client.token);
    expect((await counterpart(c.attorney.auth, c.id)).online).toBeNull();
    expect(
      (
        await api()
          .get('/api/v1/users/me/activity-status')
          .set(c.attorney.auth)
          .expect(200)
      ).body.data.showActivityStatus,
    ).toBe(false);
  });

  it('"typing…" reaches the other side\'s chat list (chat not open)', async () => {
    const c = await chat();
    const attorneySock = await connect(c.attorney.token);
    const clientSock = await connect(c.client.token);
    // The handshake may still be finishing: retry like the app does.
    let joined = false;
    for (let i = 0; i < 10 && !joined; i++) {
      joined = (
        (await clientSock.emitWithAck('conversation:join', {
          conversationId: c.id,
        })) as { ok: boolean }
      ).ok;
      if (!joined) await new Promise((r) => setTimeout(r, 150));
    }
    expect(joined).toBe(true);
    const typing = new Promise<{ conversationId: string; typing: boolean }>(
      (resolve) => attorneySock.once('typing', resolve),
    );
    clientSock.emit('typing:start', { conversationId: c.id });
    expect(await typing).toEqual({ conversationId: c.id, typing: true });
  });

  it('nothing across a block; strangers cannot watch', async () => {
    const c = await chat();
    await connect(c.attorney.token);
    await api()
      .put(`/api/v1/users/${c.attorney.id}/block`)
      .set(c.client.auth)
      .expect(204);
    expect((await counterpart(c.client.auth, c.id)).online).toBeNull();

    const other = await chat();
    const s = await connect(other.client.token);
    const res = (await s.emitWithAck('presence:watch', {
      userId: c.attorney.id,
    })) as { ok: boolean };
    expect(res.ok).toBe(false);
  });
});
