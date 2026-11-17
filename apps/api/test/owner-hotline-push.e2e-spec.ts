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
import { FeatureFlagsService } from '../src/modules/feature-flags/services/feature-flags.service';
import { HotlineSweeper } from '../src/modules/hotline/hotline-sweeper.service';

/**
 * Owner row 87, hotline plan PR 5 — «Адвокат на линии» to a client who
 * pressed «Сообщите, когда появится адвокат» and left. Two real sockets and
 * the HTTP API: the notice reaches the client's socket AND is stored as a
 * `hotline_attorney_available` notification (the push pipeline: FCM / APNs,
 * the «Звонки» switch, the bell list) with the claim token; «Позвонить
 * сейчас» with that token puts him back online with his original time and
 * the attorney gets the offer; a foreign token is refused. No notices at
 * night in the client's own clock (his account's time zone when the phone
 * sent none), unless he allowed them; inside his own quiet hours only the
 * socket event goes out (a push held until morning would be stale).
 */
jest.setTimeout(120_000);

/** An IANA zone whose local hour is [hour] right now (Etc/GMT±N). */
function zoneAtHour(hour: number): string {
  let off = (hour - new Date().getUTCHours()) % 24;
  if (off > 11) off -= 24;
  if (off < -12) off += 24;
  // Etc/GMT signs are inverted: Etc/GMT-5 is UTC+5.
  return off === 0
    ? 'Etc/GMT'
    : `Etc/GMT${off > 0 ? '-' : '+'}${Math.abs(off)}`;
}

describe('Hotline: «Адвокат на линии» push, claim token, night window (e2e, plan PR 5)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let redis: Redis;
  let sweeper: HotlineSweeper;
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
    redis = app.get<Redis>(REDIS_CLIENT);
    sweeper = app.get(HotlineSweeper);
    await setFlag(true);
    await prisma.state.upsert({
      where: { code: 'CA' },
      create: { code: 'CA', name: 'California' },
      update: { is_active: true },
    });
    await prisma.practiceArea.upsert({
      where: { code: 'hotline_push_e2e' },
      create: {
        code: 'hotline_push_e2e',
        name_en: 'Hotline push e2e',
        i18n_key: 'practice.hotline_push_e2e',
        sort: 0,
      },
      update: { is_active: true },
    });
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await setFlag(false);
    await app.close();
  });

  beforeEach(async () => {
    const keys = await redis.keys('hl:{hl}*');
    if (keys.length) await redis.del(...keys);
  });

  async function setFlag(enabled: boolean): Promise<void> {
    await prisma.featureFlag.upsert({
      where: { key: 'hotline' },
      create: { key: 'hotline', enabled },
      update: { enabled },
    });
    await app.get(FeatureFlagsService).invalidate();
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
      data: { role: 'attorney', first_name: 'Nia', last_name: 'Notice' },
    });
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username: `hlp_${u.id.slice(0, 8)}`,
        username_lower: `hlp_${u.id.slice(0, 8)}`,
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

  async function client(timezone?: string): Promise<Person> {
    const u = await prisma.user.create({
      data: {
        role: 'client',
        first_name: 'Ola',
        last_name: 'Offline',
        phone_verified_at: new Date(),
        ...(timezone ? { timezone } : {}),
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

  /** The client asks while nobody is on the line, then leaves with
   * «Сообщите, когда появится адвокат». */
  async function waitOffline(
    c: Person,
    body: { timeZone?: string; allowNight?: boolean },
  ): Promise<string> {
    const created = await api()
      .post('/api/v1/hotline/requests')
      .set(c.auth)
      .send({
        state: 'CA',
        practiceArea: 'hotline_push_e2e',
        languages: ['en'],
        topic: 'Lease dispute',
      })
      .expect(201);
    const id = created.body.data.id as string;
    expect(created.body.data.status).toBe('queued');
    const off = await api()
      .post(`/api/v1/hotline/requests/${id}/notify-me`)
      .set(c.auth)
      .send(body)
      .expect(200);
    expect(off.body.data.status).toBe('offline');
    return id;
  }

  async function lawyerOnLine(): Promise<{ a: Person; sock: Socket }> {
    const a = await attorney();
    const sock = await connect(a.token);
    await api()
      .put('/api/v1/hotline/line')
      .set(a.auth)
      .send({
        states: ['CA'],
        practiceAreas: ['hotline_push_e2e'],
        languages: ['en'],
      })
      .expect(200);
    await sock.emitWithAck('hotline:heartbeat', {});
    return { a, sock };
  }

  const noticesOf = (userId: string) =>
    prisma.notification.findMany({
      where: { user_id: userId, type: 'hotline_attorney_available' },
    });

  it('a free attorney → the offline client gets the socket event AND the stored push with the claim token; «Позвонить сейчас» with it → the attorney gets the offer', async () => {
    const c = await client();
    const cSock = await connect(c.token);
    const requestId = await waitOffline(c, { allowNight: true });
    const notice = once<{
      requestId: string;
      token: string;
      expiresAt: number;
      textKey: string;
    }>(cSock, 'hotline:notify');
    const { a, sock } = await lawyerOnLine();
    await sweeper.sweep(redis, Date.now());
    const n = await notice;
    expect(n).toMatchObject({
      requestId,
      textKey: 'notif.messages.hotline_attorney_available.title',
    });
    expect(n.token).toMatch(/^[0-9a-f-]{36}$/);

    // the stored notification → the push queue (closed app)
    const rows = await noticesOf(c.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ category: 'calls' });
    expect(rows[0].payload).toMatchObject({
      requestId,
      claimToken: n.token,
      expiresAt: n.expiresAt,
    });
    // a foreign token is refused
    const bad = await api()
      .post(`/api/v1/hotline/requests/${requestId}/claim`)
      .set(c.auth)
      .send({ token: randomUUID() })
      .expect(403);
    expect(bad.body.error).toMatchObject({
      code: 'FORBIDDEN',
      details: { reason: 'claim_token' },
    });
    // the notice's token → online again, the attorney gets the offer
    const offer = once<{ requestId: string }>(sock, 'hotline:offer');
    const ok = await api()
      .post(`/api/v1/hotline/requests/${requestId}/claim`)
      .set(c.auth)
      .send({ token: n.token })
      .expect(200);
    expect(ok.body.data.status).toBe('searching');
    expect((await offer).requestId).toBe(requestId);
    // the app's own «Позвонить сейчас» needs no token (idempotent)
    await api()
      .post(`/api/v1/hotline/requests/${requestId}/claim`)
      .set(c.auth)
      .send({})
      .expect(200);
    expect(a.id).not.toBe(c.id);
  });

  it('no notices at night in the client’s own clock: his account’s zone when the phone sent none; the daytime client is told', async () => {
    const night = await client(zoneAtHour(3));
    const nightSock = await connect(night.token);
    let nightNotices = 0;
    nightSock.on('hotline:notify', () => (nightNotices += 1));
    // older request, at 03:00 his time, no zone from the phone
    await waitOffline(night, {});
    const dayZone = zoneAtHour(12);
    const day = await client();
    const daySock = await connect(day.token);
    const dayId = await waitOffline(day, { timeZone: dayZone });
    const dayNotice = once<{ requestId: string }>(daySock, 'hotline:notify');
    await lawyerOnLine();
    await sweeper.sweep(redis, Date.now());
    expect((await dayNotice).requestId).toBe(dayId);
    await new Promise((r) => setTimeout(r, 300));
    expect(nightNotices).toBe(0);
    expect(await noticesOf(night.id)).toHaveLength(0);
    expect(await noticesOf(day.id)).toHaveLength(1);
  });

  it('the night is allowed by the client → told at night too', async () => {
    const c = await client(zoneAtHour(3));
    const sock = await connect(c.token);
    const id = await waitOffline(c, { allowNight: true });
    const notice = once<{ requestId: string }>(sock, 'hotline:notify');
    await lawyerOnLine();
    await sweeper.sweep(redis, Date.now());
    expect((await notice).requestId).toBe(id);
    expect(await noticesOf(c.id)).toHaveLength(1);
  });

  it('inside the client’s own quiet hours: the socket event only, no push (it would be stale by morning)', async () => {
    const c = await client();
    const now = new Date();
    const h = now.getUTCHours();
    await prisma.notificationQuietHours.create({
      data: {
        user_id: c.id,
        start_time: new Date(Date.UTC(1970, 0, 1, (h + 23) % 24, 0)),
        end_time: new Date(Date.UTC(1970, 0, 1, (h + 1) % 24, 59)),
        timezone: 'UTC',
      },
    });
    const sock = await connect(c.token);
    const id = await waitOffline(c, { allowNight: true });
    const notice = once<{ requestId: string }>(sock, 'hotline:notify');
    await lawyerOnLine();
    await sweeper.sweep(redis, Date.now());
    expect((await notice).requestId).toBe(id);
    expect(await noticesOf(c.id)).toHaveLength(0);
  });
});
