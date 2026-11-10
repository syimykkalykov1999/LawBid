import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AdminSummaryService } from '../src/common/admin-summary/admin-summary.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { adminSession } from './support/admin-login';

/**
 * Speed matrix 2026-11-09 (§3 #4, #5): the admin lists answer a cheap
 * ETag before the list query and 304 to a matching If-None-Match; the
 * admin live channel hands out a one-shot ticket, the `/admin` namespace
 * takes it once, and a stored admin value that changed reaches the socket
 * as `admin:changed`.
 */
jest.setTimeout(120_000);

describe('Admin speed gaps (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let summary: AdminSummaryService;
  let base = '';
  let auth: Record<string, string> = {};
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
    base = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    summary = app.get(AdminSummaryService);
    auth = (await adminSession(base, prisma, 'super_admin')).auth;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await app.close();
  });

  const api = () => request(base);

  it.each([
    '/admin/users?limit=5',
    '/admin/cases?limit=5',
    '/admin/audit-log?limit=5',
  ])('GET %s: a cheap tag, then 304 for the same tag', async (path) => {
    const first = await api().get(`/api/v1${path}`).set(auth).expect(200);
    const etag = first.headers.etag;
    expect(etag).toMatch(/^W\/"adm-/);
    const again = await api()
      .get(`/api/v1${path}`)
      .set(auth)
      .set('If-None-Match', etag)
      .expect(304);
    expect(again.text ?? '').toBe('');
    expect(again.headers.etag).toBe(etag);
    // another tag: the list, with the same tag on it
    const other = await api()
      .get(`/api/v1${path}`)
      .set(auth)
      .set('If-None-Match', 'W/"adm-users-old"')
      .expect(200);
    expect(other.headers.etag).toBe(etag);
    expect(Array.isArray((other.body as { data: unknown[] }).data)).toBe(true);
  });

  function connect(ticket: string): Promise<{ event: string; data: unknown }> {
    const socket = io(`${base}/admin`, {
      transports: ['websocket'],
      auth: { ticket },
      reconnection: false,
    });
    sockets.push(socket);
    return new Promise((resolve) => {
      socket.on('admin:ready', (data: unknown) =>
        resolve({ event: 'admin:ready', data }),
      );
      socket.on('auth:error', (data: unknown) =>
        resolve({ event: 'auth:error', data }),
      );
    });
  }

  it('live channel: a one-shot ticket opens the socket once; a changed board reaches it', async () => {
    const res = await api()
      .post('/api/v1/admin/realtime/ticket')
      .set(auth)
      .expect(200);
    const { enabled, ticket, namespace, ttlSec } = (
      res.body as {
        data: {
          enabled: boolean;
          ticket: string;
          namespace: string;
          ttlSec: number;
        };
      }
    ).data;
    expect(enabled).toBe(true);
    expect(namespace).toBe('/admin');
    expect(ttlSec).toBe(60);
    expect(ticket).toMatch(/^[A-Za-z0-9_-]{32}$/);

    const first = await connect(ticket);
    expect(first.event).toBe('admin:ready');
    // the same ticket again: refused (redeemed once)
    const second = await connect(ticket);
    expect(second).toEqual({
      event: 'auth:error',
      data: { code: 'UNAUTHORIZED' },
    });
    // a made-up ticket: refused
    const forged = await connect('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz');
    expect(forged.event).toBe('auth:error');

    const live = sockets[0];
    const changed = new Promise<{ key: string }>((resolve) =>
      live.on('admin:changed', (d: { key: string }) => resolve(d)),
    );
    // a stored admin value changes (what an action or a refresh does)
    await summary.put('speed-gaps-board', { n: Date.now() });
    const got = await Promise.race([
      changed,
      new Promise<{ key: string }>((_, reject) =>
        setTimeout(
          () => reject(new Error('no admin:changed within 5 s')),
          5000,
        ),
      ),
    ]);
    expect(got.key).toBe('speed-gaps-board');
  });

  it('a socket that sends anything is closed (read-only namespace)', async () => {
    const res = await api()
      .post('/api/v1/admin/realtime/ticket')
      .set(auth)
      .expect(200);
    const ticket = (res.body as { data: { ticket: string } }).data.ticket;
    await connect(ticket);
    const socket = sockets[sockets.length - 1];
    const closed = new Promise<string>((resolve) =>
      socket.on('disconnect', (reason) => resolve(reason)),
    );
    socket.emit('admin:changed', { key: 'spoof' });
    expect(await closed).toMatch(/io server disconnect/);
  });
});
