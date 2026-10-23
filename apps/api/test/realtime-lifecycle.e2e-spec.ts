import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { RealtimePublisher } from '../src/modules/realtime/realtime-publisher.service';
import { RealtimeGateway } from '../src/modules/realtime/realtime.gateway';

/**
 * Owner 2026-10-23 («связь пропала / восстановилась»): the live socket
 * announces its cursor, every event to a person carries `seq`, a
 * reconnecting client fetches only what it missed (socket and HTTP),
 * `auth:refresh` keeps the socket, a draining server tells sockets to go,
 * and the app gets its connection timings from the config.
 */
jest.setTimeout(120_000);

describe('Realtime lifecycle (e2e, owner 2026-10-23)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let publisher: RealtimePublisher;
  let gateway: RealtimeGateway;
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
    publisher = app.get(RealtimePublisher);
    gateway = app.get(RealtimeGateway);
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await app.close();
  });

  const sign = (id: string, sid = randomUUID()) =>
    tokens.signAccessToken({
      sub: id,
      role: 'client',
      sid,
      verified: false,
      subscriptionStatus: 'none',
    });

  async function person() {
    const u = await prisma.user.create({
      data: { role: 'client', first_name: 'Rita', last_name: 'Realtime' },
    });
    return u.id;
  }

  function connect(
    token: string,
  ): Promise<{ socket: Socket; ready: { seq: number } }> {
    const socket = io(`${base}/realtime`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(socket);
    return new Promise((resolve, reject) => {
      socket.once('realtime:ready', (ready: { seq: number }) =>
        resolve({ socket, ready }),
      );
      socket.on('connect_error', reject);
    });
  }

  const nextEvent = <T>(socket: Socket, name: string) =>
    new Promise<T>((resolve) => socket.once(name, resolve));

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('announces the cursor, stamps events with seq and serves the missed ones', async () => {
    const id = await person();
    const { socket, ready } = await connect(sign(id));
    expect(ready.seq).toBeGreaterThan(0);

    const live = nextEvent<{ total: number; seq: number }>(
      socket,
      'badge:update',
    );
    publisher.toUsers([id], 'badge:update', { total: 1 });
    const first = await live;
    expect(first.total).toBe(1);
    expect(first.seq).toBeGreaterThan(ready.seq);

    // The client "lost" the socket; two more events happen meanwhile.
    socket.disconnect();
    publisher.toUsers([id], 'badge:update', { total: 2 });
    publisher.toUsers([id], 'badge:update', { total: 3 });
    await wait(500);

    // HTTP twin.
    const auth = { Authorization: `Bearer ${sign(id)}` };
    const res = await request(base)
      .get(`/api/v1/realtime/missed?since=${first.seq}`)
      .set(auth)
      .expect(200);
    const data = res.body.data as {
      seq: number;
      complete: boolean;
      events: { event: string; data: { total: number } }[];
    };
    expect(data.complete).toBe(true);
    expect(data.events.map((e) => e.data.total)).toEqual([2, 3]);
    expect(data.seq).toBeGreaterThanOrEqual(data.events[1].data.total);

    // Socket twin.
    const again = await connect(sign(id));
    const ack = await again.socket.emitWithAck('sync:since', {
      seq: first.seq,
    });
    expect(ack.ok).toBe(true);
    expect(ack.complete).toBe(true);
    expect(ack.events).toHaveLength(2);

    // A stranger sees nothing of it; a cursor of 0 means "full refresh".
    const other = await person();
    const none = await request(base)
      .get(`/api/v1/realtime/missed?since=${first.seq}`)
      .set({ Authorization: `Bearer ${sign(other)}` })
      .expect(200);
    expect(none.body.data.events).toEqual([]);
    const zero = await request(base)
      .get('/api/v1/realtime/missed?since=0')
      .set(auth)
      .expect(200);
    expect(zero.body.data.complete).toBe(false);
    await request(base)
      .get('/api/v1/realtime/missed?since=abc')
      .set(auth)
      .expect(400);
    await request(base).get('/api/v1/realtime/missed?since=1').expect(401);
  });

  it('auth:refresh keeps the socket alive (accessToken and the old token field)', async () => {
    const id = await person();
    const sid = randomUUID();
    const { socket } = await connect(sign(id, sid));
    const a = await socket.emitWithAck('auth:refresh', {
      accessToken: sign(id, sid),
    });
    expect(a.ok).toBe(true);
    expect(typeof a.expiresAt).toBe('string');
    const b = await socket.emitWithAck('auth:refresh', {
      token: sign(id, sid),
    });
    expect(b.ok).toBe(true);
    await wait(300);
    expect(socket.connected).toBe(true);
  });

  it('a draining server tells sockets to go and turns new ones away', async () => {
    const id = await person();
    const { socket } = await connect(sign(id));
    const away = nextEvent<{ retryAfterMs: number }>(
      socket,
      'server:going-away',
    );
    await gateway.startDraining();
    const payload = await away;
    expect(payload.retryAfterMs).toBeGreaterThanOrEqual(0);
    expect(payload.retryAfterMs).toBeLessThanOrEqual(20_000);
    expect(gateway.isDraining).toBe(true);

    const late = io(`${base}/realtime`, {
      auth: { token: sign(id) },
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(late);
    // Both packets can arrive in one go: listen for them up front.
    const goneEvent = nextEvent(late, 'server:going-away');
    const closed = new Promise((r) => late.once('disconnect', r));
    await goneEvent;
    await closed;
  });

  it('GET /config/bootstrap and /me/session carry client.timings', async () => {
    const boot = await request(base)
      .get('/api/v1/config/bootstrap')
      .expect(200);
    const t = boot.body.data.client.timings as Record<string, number>;
    expect(t.reconnectMinMs).toBe(1000);
    expect(t.reconnectMaxMs).toBe(30_000);
    expect(t.tokenRefreshLeadSeconds).toBe(120);
    expect(t.offlineFailures).toBe(2);
    expect(JSON.stringify(boot.body.data.app_config)).not.toContain(
      'realtime.',
    );
  });
});
