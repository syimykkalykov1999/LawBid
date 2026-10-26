import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AccessToken } from 'livekit-server-sdk';
import request from 'supertest';
import type Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { useBodyParsers } from '../src/app.setup';
import { IncidentsService } from '../src/common/ops/status/incidents.service';
import { StatusWatchdogJob } from '../src/jobs/handlers/status-watchdog.job';
import { dropAppConfigCache } from '../src/modules/feature-flags/services/app-config.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { adminSession } from './support/admin-login';

/**
 * Owner 2026-10-22: (a) LiveKit behind `calls.video_provider` — the switch
 * refuses without keys, the token and the signed webhook drive the call;
 * (b) «Состояние системы» — the extra board items, the watchdog's incident
 * lifecycle and who is on call.
 */
jest.setTimeout(120_000);

const seenPaths: string[] = [];
const LK = {
  url: 'wss://lk.e2e.test',
  apiKey: 'APIe2ekey',
  apiSecret: 'e2e-livekit-secret-0123456789abcdef',
};

describe('LiveKit + status board (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let tokens: TokenService;
  let base = '';
  const api = () => request(base);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    useBodyParsers(app as never, '256kb');
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
    redis = app.get(REDIS_CLIENT);
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await prisma.appConfig.deleteMany({
      where: { key: { startsWith: 'calls.' } },
    });
    await dropAppConfigCache(redis);
    delete process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
    await app.close();
  });

  const bearer = (id: string, role: 'client' | 'attorney') => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });

  describe('LiveKit', () => {
    it('livekit cannot be selected without its keys (clear admin error)', async () => {
      const admin = await adminSession(base, prisma, 'super_admin');
      const refused = await api()
        .put('/api/v1/admin/config/calls.video_provider')
        .set(admin.auth)
        .send({ value: 'livekit' })
        .expect(400);
      expect(JSON.stringify(refused.body)).toContain('LIVEKIT_URL');
      expect(JSON.stringify(refused.body)).toContain('LIVEKIT_API_SECRET');
      // p2p is always allowed; unknown words are refused.
      await api()
        .put('/api/v1/admin/config/calls.video_provider')
        .set(admin.auth)
        .send({ value: 'p2p' })
        .expect(200);
      await api()
        .put('/api/v1/admin/config/calls.video_provider')
        .set(admin.auth)
        .send({ value: 'zoom' })
        .expect(400);
    });

    it('with keys: switch, token for the call, signed webhook ends the call', async () => {
      process.env.LIVEKIT_URL = LK.url;
      process.env.LIVEKIT_API_KEY = LK.apiKey;
      process.env.LIVEKIT_API_SECRET = LK.apiSecret;
      const admin = await adminSession(base, prisma, 'super_admin');
      const caller = await prisma.user.create({
        data: { role: 'attorney', first_name: 'Lk', last_name: 'Caller' },
      });
      const callee = await prisma.user.create({
        data: { role: 'client', first_name: 'Lk', last_name: 'Callee' },
      });
      const outsider = await prisma.user.create({
        data: { role: 'client', first_name: 'Lk', last_name: 'Out' },
      });
      const call = await prisma.call.create({
        data: {
          caller_id: caller.id,
          callee_id: callee.id,
          status: 'active',
          answered_at: new Date(),
          video: true,
        },
      });

      // p2p (default): no LiveKit token.
      await api()
        .post(`/api/v1/calls/${call.id}/livekit-token`)
        .set(bearer(caller.id, 'attorney'))
        .expect(409);
      const cfgBefore = await api()
        .get('/api/v1/calls/video')
        .set(bearer(caller.id, 'attorney'))
        .expect(200);
      expect(cfgBefore.body.data.provider).toBe('webrtc');

      await api()
        .put('/api/v1/admin/config/calls.video_provider')
        .set(admin.auth)
        .send({ value: 'livekit' })
        .expect(200);
      const cfg = await api()
        .get('/api/v1/calls/video')
        .set(bearer(caller.id, 'attorney'))
        .expect(200);
      expect(cfg.body.data.provider).toBe('livekit');

      // A stand-in LiveKit server that accepts CreateRoom.
      const fake = createServer((req, res) => {
        seenPaths.push(req.url ?? '');
        res.setHeader('content-type', 'application/json');
        res.end('{}');
      });
      await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r));
      const fakeUrl = `ws://127.0.0.1:${(fake.address() as AddressInfo).port}`;
      process.env.LIVEKIT_URL = fakeUrl;
      const member = await api()
        .post(`/api/v1/calls/${call.id}/livekit-token`)
        .set(bearer(callee.id, 'client'))
        .expect(200);
      expect(member.body.data).toMatchObject({
        url: fakeUrl,
        room: call.id,
        identity: callee.id,
        role: 'speaker',
      });
      expect(seenPaths.some((p) => p.includes('CreateRoom'))).toBe(true);
      const claims = JSON.parse(
        Buffer.from(
          (member.body.data as { token: string }).token.split('.')[1],
          'base64url',
        ).toString(),
      ) as { sub: string; video: { room: string } };
      expect(claims.sub).toBe(callee.id);
      expect(claims.video.room).toBe(call.id);
      const host = await api()
        .post(`/api/v1/calls/${call.id}/livekit-token`)
        .set(bearer(caller.id, 'attorney'))
        .expect(200);
      expect(host.body.data.role).toBe('host');
      fake.close();
      process.env.LIVEKIT_URL = LK.url;

      // A stranger gets 404; a member gets a token (the room is created on
      // the LiveKit server, which does not exist here: that call fails, so
      // the token endpoint answers a clear 5xx instead of a token).
      await api()
        .post(`/api/v1/calls/${call.id}/livekit-token`)
        .set(bearer(outsider.id, 'client'))
        .expect(404);

      // Webhook: unsigned and wrongly signed are 404; signed participant_left
      // of a two-person call ends it.
      const body = JSON.stringify({
        event: 'participant_left',
        room: { name: call.id },
        participant: { identity: callee.id },
      });
      await api()
        .post('/api/v1/webhooks/livekit')
        .set('Content-Type', 'application/webhook+json')
        .send(body)
        .expect(404);
      const bad = new AccessToken(LK.apiKey, 'x'.repeat(40));
      bad.sha256 = createHash('sha256').update(body).digest('base64');
      await api()
        .post('/api/v1/webhooks/livekit')
        .set('Content-Type', 'application/webhook+json')
        .set('Authorization', await bad.toJwt())
        .send(body)
        .expect(404);
      const good = new AccessToken(LK.apiKey, LK.apiSecret);
      good.sha256 = createHash('sha256').update(body).digest('base64');
      await api()
        .post('/api/v1/webhooks/livekit')
        .set('Content-Type', 'application/webhook+json')
        .set('Authorization', await good.toJwt())
        .send(body)
        .expect(200);
      const after = await prisma.call.findUniqueOrThrow({
        where: { id: call.id },
      });
      expect(after.status).toBe('ended');

      // Back to p2p so later suites are not affected.
      await api()
        .put('/api/v1/admin/config/calls.video_provider')
        .set(admin.auth)
        .send({ value: 'p2p' })
        .expect(200);
    });
  });

  describe('status board', () => {
    it('the board lists the new items and the incidents of 24 h', async () => {
      const admin = await adminSession(base, prisma, 'super_admin');
      const r = await api()
        .get('/api/v1/admin/system-health')
        .set(admin.auth)
        .expect(200);
      const keys = (r.body.data.items as { key: string }[]).map((i) => i.key);
      for (const k of ['stripe_webhooks', 'push', 'turn', 'http']) {
        expect(keys).toContain(k);
      }
      expect(Array.isArray(r.body.data.incidents)).toBe(true);
    });

    it('watchdog: two red checks open one incident, de-duped; good checks close it', async () => {
      const incidents = app.get(IncidentsService);
      const key = `db_${randomUUID().slice(0, 6)}`;
      const red = [{ key, status: 'red' as const, detail: { error: 'x' } }];
      const green = [{ key, status: 'green' as const, detail: {} }];
      expect(await incidents.reconcile(red)).toHaveLength(0);
      const opened = await incidents.reconcile(red);
      expect(opened.map((e) => e.kind)).toEqual(['opened']);
      // Still red a minute later: nothing new (reminder is 15 min).
      expect(await incidents.reconcile(red)).toHaveLength(0);
      expect(
        await prisma.systemIncident.count({
          where: { component: key, closed_at: null },
        }),
      ).toBe(1);
      expect(await incidents.reconcile(green)).toHaveLength(0);
      const closed = await incidents.reconcile(green);
      expect(closed.map((e) => e.kind)).toEqual(['resolved']);
      expect(
        await prisma.systemIncident.count({
          where: { component: key, closed_at: null },
        }),
      ).toBe(0);
    });

    it('only on-call admins (owner, or the right, with their switch on) are alerted', async () => {
      const incidents = app.get(IncidentsService);
      const owner = await adminSession(base, prisma, 'super_admin');
      const oncall = await adminSession(base, prisma, 'support', undefined, {
        dashboard: 'view',
        on_call: 'view',
      });
      const plain = await adminSession(base, prisma, 'support', undefined, {
        dashboard: 'view',
      });
      const ids = (await incidents.recipients()).map((p) => p.userId);
      expect(ids).toContain(owner.userId);
      expect(ids).toContain(oncall.userId);
      expect(ids).not.toContain(plain.userId);

      // The per-admin switch (Профиль).
      const me = await api()
        .get('/api/v1/admin/auth/me')
        .set(oncall.auth)
        .expect(200);
      expect(me.body.data.onCallAvailable).toBe(true);
      expect(me.body.data.onCallEnabled).toBe(true);
      const plainMe = await api()
        .get('/api/v1/admin/auth/me')
        .set(plain.auth)
        .expect(200);
      expect(plainMe.body.data.onCallAvailable).toBe(false);
      await api()
        .put('/api/v1/admin/auth/me/on-call')
        .set(oncall.auth)
        .send({ enabled: false })
        .expect(200);
      const after = (await incidents.recipients()).map((p) => p.userId);
      expect(after).not.toContain(oncall.userId);
      expect(after).toContain(owner.userId);
    });

    it('the watchdog job runs end to end', async () => {
      const result = await app.get(StatusWatchdogJob).run();
      expect(result.checked).toBeGreaterThanOrEqual(8);
    });
  });
});
