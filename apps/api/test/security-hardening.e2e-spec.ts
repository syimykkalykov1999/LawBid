import { once } from 'node:events';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { BOOTSTRAP_CACHE_KEY } from '../src/modules/feature-flags/services/bootstrap.service';

/**
 * Production hardening (ledger leaf-1.2 G1; docs/01 §7, §13): readiness
 * probe with real dependency checks, security headers, no API docs in
 * production, cached bootstrap, atomic idempotency, graceful shutdown.
 * Runs against the real (isolated) CockroachDB + Redis — see
 * test/support/e2e-global-setup.ts — and the exact main.ts wiring via
 * configureApp().
 */
// App boots with production settings several times; under the full serial
// run a boot can exceed jest's 5 s default.
jest.setTimeout(30_000);

describe('Security hardening (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let sigtermBefore: number;
  let sigtermAfter: number;

  async function createApp(
    nodeEnv?: 'production',
  ): Promise<NestExpressApplication> {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const created = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: true,
    });
    configureApp(created, nodeEnv ? { nodeEnv } : {});
    await created.init();
    // One real listener per app: supertest reuses it instead of an
    // ephemeral server per request (avoids intermittent ECONNRESET).
    await created.listen(0, '127.0.0.1');
    return created;
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    sigtermBefore = process.listeners('SIGTERM').length;
    app = await createApp();
    sigtermAfter = process.listeners('SIGTERM').length;
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS_CLIENT);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  /** Really takes the shared Redis connection down (commands fail with
   * "Connection is closed"), then brings it back and waits until ready. */
  async function withRedisDown(fn: () => Promise<void>): Promise<void> {
    const ended = once(redis, 'end');
    redis.disconnect();
    await ended;
    try {
      await fn();
    } finally {
      const ready = once(redis, 'ready');
      await redis.connect();
      await ready;
    }
  }

  // -------------------------------------------------------------------
  describe('GET /health/ready', () => {
    it('is 200 with database and redis up', async () => {
      const res = await api().get('/health/ready').expect(200);
      expect(res.body.data ?? res.body).toMatchObject({
        status: 'ok',
        info: { database: { status: 'up' }, redis: { status: 'up' } },
      });
    });

    it('is 503 while Redis is unreachable, and recovers when it is back', async () => {
      await withRedisDown(async () => {
        const down = await api().get('/health/ready');
        expect(down.status).toBe(503);
      });
      await api().get('/health/ready').expect(200);
    });

    it('is 503 while the database is unreachable', async () => {
      const spy = jest
        .spyOn(prisma, '$queryRaw')
        .mockRejectedValue(new Error('connection refused'));
      try {
        const down = await api().get('/health/ready');
        expect(down.status).toBe(503);
        // Unauthenticated probe must not leak connection details.
        expect(JSON.stringify(down.body)).not.toContain('connection refused');
      } finally {
        spy.mockRestore();
      }
      await api().get('/health/ready').expect(200);
    });

    it('live does not depend on Redis', async () => {
      await withRedisDown(async () => {
        await api().get('/health/live').expect(200);
      });
    });
  });

  // -------------------------------------------------------------------
  describe('security headers (helmet)', () => {
    it('sets the standard hardening headers and hides x-powered-by', async () => {
      const res = await api().get('/health/live').expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
      expect(res.headers['x-powered-by']).toBeUndefined();
      // X-Request-Id still echoed alongside helmet.
      expect(res.headers['x-request-id']).toBeDefined();
    });
  });

  // -------------------------------------------------------------------
  describe('API docs exposure', () => {
    it('serves /docs and /docs-json outside production', async () => {
      await api().get('/docs').redirects(1).expect(200);
      const json = await api().get('/docs-json').expect(200);
      expect(json.body.openapi).toBeDefined();
    });

    it('does not mount /docs or /docs-json when NODE_ENV=production, and adds CSP + HSTS', async () => {
      const prod = await createApp('production');
      try {
        const server = prod.getHttpServer();
        await request(server).get('/docs').expect(404);
        await request(server).get('/docs/').expect(404);
        await request(server).get('/docs-json').expect(404);
        const res = await request(server).get('/health/live').expect(200);
        expect(res.headers['content-security-policy']).toContain(
          "default-src 'self'",
        );
        expect(res.headers['strict-transport-security']).toContain(
          'max-age=31536000',
        );
      } finally {
        await prod.close();
      }
    });
  });

  // -------------------------------------------------------------------
  describe('GET /config/bootstrap caching', () => {
    afterAll(async () => {
      await prisma.i18nLanguage.deleteMany({ where: { code: 'zz' } });
      await redis.del(BOOTSTRAP_CACHE_KEY);
    });

    it('serves languages/legal docs from Redis on repeat, until invalidated or expired', async () => {
      await redis.del(BOOTSTRAP_CACHE_KEY);
      const first = await api().get('/api/v1/config/bootstrap').expect(200);
      const ttl = await redis.ttl(BOOTSTRAP_CACHE_KEY);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(30);

      // A row written straight to the DB is NOT visible on repeat: the
      // repeat was answered from the cache, not by re-querying.
      await prisma.i18nLanguage.create({
        data: { code: 'zz', name_native: 'Zed', is_active: true, sort: 99 },
      });
      const second = await api().get('/api/v1/config/bootstrap').expect(200);
      expect(second.body.data.languages).toEqual(first.body.data.languages);
      expect(
        (second.body.data.languages as { code: string }[]).some(
          (l) => l.code === 'zz',
        ),
      ).toBe(false);

      // Once the entry is gone (TTL / invalidation) the DB is read again.
      await redis.del(BOOTSTRAP_CACHE_KEY);
      const third = await api().get('/api/v1/config/bootstrap').expect(200);
      expect(
        (third.body.data.languages as { code: string }[]).some(
          (l) => l.code === 'zz',
        ),
      ).toBe(true);
    });

    it('reflects an i18n import (bundle version key) immediately despite the cache', async () => {
      await api().get('/api/v1/config/bootstrap').expect(200); // warm cache
      // What I18nImportService does right after committing an import.
      await redis.set('i18n:bundle:version:zz', '7', 'EX', 300);
      const res = await api().get('/api/v1/config/bootstrap').expect(200);
      expect(res.body.data.translations_version.zz).toBe(7);
      await redis.del('i18n:bundle:version:zz');
    });
  });

  // -------------------------------------------------------------------
  describe('Idempotency-Key under concurrency', () => {
    async function otpRequestedCount(): Promise<number> {
      return prisma.authEvent.count({
        where: { event_type: 'otp_requested' },
      });
    }

    it('concurrent requests with the same key run the handler exactly once', async () => {
      const before = await otpRequestedCount();
      const key = `conc-${Date.now()}`;
      const send = () =>
        api()
          .post('/api/v1/auth/otp/request')
          .set('Idempotency-Key', key)
          .send({ channel: 'phone', identifier: '+12025557001' });

      const responses = await Promise.all([
        send(),
        send(),
        send(),
        send(),
        send(),
      ]);

      const ok = responses.filter((r) => r.status === 200);
      const conflicts = responses.filter((r) => r.status === 409);
      expect(ok.length).toBeGreaterThanOrEqual(1);
      expect(ok.length + conflicts.length).toBe(responses.length);
      for (const r of ok) expect(r.body).toEqual(ok[0].body);
      for (const r of conflicts) {
        expect(r.body.error.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
        expect(r.body.error.details.reason).toBe('in_progress');
      }
      expect(await otpRequestedCount()).toBe(before + 1);

      // A later retry replays instead of sending a second code.
      const retry = await send();
      expect(retry.status).toBe(200);
      expect(retry.body).toEqual(ok[0].body);
      expect(await otpRequestedCount()).toBe(before + 1);
    });

    it('the same key with a different body is rejected, not replayed', async () => {
      const key = `mismatch-${Date.now()}`;
      await api()
        .post('/api/v1/auth/otp/request')
        .set('Idempotency-Key', key)
        .send({ channel: 'phone', identifier: '+12025557002' })
        .expect(200);
      const res = await api()
        .post('/api/v1/auth/otp/request')
        .set('Idempotency-Key', key)
        .send({ channel: 'phone', identifier: '+12025557003' });
      expect(res.status).toBe(409);
      expect(res.body.error.details.reason).toBe('payload_mismatch');
    });

    it('a failed request releases the key so it can be retried', async () => {
      const key = `release-${Date.now()}`;
      await api()
        .post('/api/v1/auth/otp/request')
        .set('Idempotency-Key', key)
        .send({ channel: 'phone', identifier: '+44 20 7946 0000' }) // non-US -> 400
        .expect(400);
      const claims = await redis.keys(`idempotency:*:${key}`);
      expect(claims).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------
  describe('graceful shutdown', () => {
    it('configureApp enables shutdown hooks (SIGTERM listener registered)', () => {
      expect(sigtermAfter).toBeGreaterThan(sigtermBefore);
    });
  });
});
