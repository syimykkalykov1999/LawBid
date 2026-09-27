import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import { Logger, PinoLogger } from 'nestjs-pino';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  CostGuardService,
  costCounterKey,
} from '../src/common/cost-guard/cost-guard.service';
import { AppConfigService } from '../src/modules/feature-flags/services/app-config.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

/**
 * Cost protection (owner-approved extension 2026-09-27, docs/
 * OPEN_QUESTIONS.md) against REAL CockroachDB + Redis (DB 15, isolated
 * throwaway database — test/support/*). Proves what the unit spec can't:
 * the Lua script's atomicity / no-over-increment / once-per-window
 * alerts, app_config-driven caps, US-only SMS, per-device and per-user
 * OTP limits, and that `trust proxy` makes per-IP keys follow
 * X-Forwarded-For.
 *
 * This suite mutates GLOBAL state (budget counters, app_config caps), so
 * test/jest-e2e.json runs suites serially (maxWorkers: 1) — otherwise a
 * lowered SMS cap here would 503 auth.e2e-spec.ts's logins.
 */
describe('Cost guard (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let guard: CostGuardService;
  let ipCounter = 0;
  const FIXED_CODE = '000000';

  // Unique client IP per request (trust proxy = 1 below) so the global
  // 100/min per-IP throttler never interferes with these scenarios.
  const nextIp = () => `198.51.100.${(ipCounter++ % 250) + 1}`;
  const api = () => request(app.getHttpServer());

  async function clearBudgetState(): Promise<void> {
    const keys = await redis.keys('budget:*');
    if (keys.length) await redis.del(...keys);
    await prisma.appConfig.deleteMany({
      where: {
        OR: [
          { key: { startsWith: 'budget.' } },
          { key: { startsWith: 'sms.' } },
        ],
      },
    });
    await redis.del('config:app_config');
  }

  async function setAppConfig(key: string, value: number | string[]) {
    await prisma.appConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    await redis.del('config:app_config'); // bypass the 30 s cache
  }

  function otpRequest(
    identifier: string,
    headers: Record<string, string> = {},
  ) {
    const req = api()
      .post('/api/v1/auth/otp/request')
      .set('X-Forwarded-For', nextIp());
    for (const [k, v] of Object.entries(headers)) req.set(k, v);
    return req.send({ channel: 'phone', identifier });
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useLogger(app.get(Logger));
    // Same setting main.ts applies from TRUST_PROXY_HOPS (1 behind the ALB).
    app.set('trust proxy', 1);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1', {
      exclude: ['/health/live', '/health/ready', '/docs', '/docs-json'],
    });
    await app.init();
    // One real listener for the suite: supertest reuses a listening
    // server instead of an ephemeral one per request, which avoided
    // intermittent ECONNRESET under load.
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS_CLIENT);
    guard = app.get(CostGuardService);
  });

  beforeEach(async () => {
    await clearBudgetState();
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await clearBudgetState();
    await app.close();
  });

  // -----------------------------------------------------------------
  describe('CostGuardService against real Redis', () => {
    // Keep the per-minute breaker out of the way so these assert the
    // daily window specifically (Lua checks minute -> daily -> monthly).
    beforeEach(() => setAppConfig('budget.id_check.per_minute_max', 100));

    it('admits up to the cap, then rejects without incrementing past it', async () => {
      await setAppConfig('budget.id_check.daily_max', 5);
      for (let i = 0; i < 5; i++) await guard.consume('id_check');
      for (let i = 0; i < 3; i++) {
        await expect(guard.consume('id_check')).rejects.toMatchObject({
          status: 503,
        });
      }
      const dayKey = costCounterKey('id_check', 'daily', new Date());
      expect(await redis.get(dayKey)).toBe('5');
      expect(await redis.ttl(dayKey)).toBeGreaterThan(86_400);
    });

    it('a multi-unit call that would overshoot is refused whole', async () => {
      await setAppConfig('budget.id_check.daily_max', 5);
      await guard.consume('id_check', 3);
      await expect(guard.consume('id_check', 3)).rejects.toMatchObject({
        status: 503,
      });
      expect(
        await redis.get(costCounterKey('id_check', 'daily', new Date())),
      ).toBe('3');
    });

    it('is atomic under concurrency: 25 parallel calls vs cap 7 -> exactly 7 admitted', async () => {
      await setAppConfig('budget.id_check.daily_max', 7);
      const results = await Promise.allSettled(
        Array.from({ length: 25 }, () => guard.consume('id_check')),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(7);
      expect(
        await redis.get(costCounterKey('id_check', 'daily', new Date())),
      ).toBe('7');
    });

    it('emits the 80% cost_budget warn exactly once and the exhaustion error exactly once', async () => {
      const warn = jest.spyOn(PinoLogger.prototype, 'warn');
      const error = jest.spyOn(PinoLogger.prototype, 'error');
      await setAppConfig('budget.id_check.daily_max', 5);
      for (let i = 0; i < 5; i++) await guard.consume('id_check');
      for (let i = 0; i < 3; i++) {
        await guard.consume('id_check').catch(() => undefined);
      }
      const budgetWarns = warn.mock.calls.filter(
        ([obj]) =>
          (obj as { alert?: string }).alert === 'cost_budget' &&
          (obj as { window?: string }).window === 'daily',
      );
      expect(budgetWarns).toHaveLength(1);
      expect(budgetWarns[0][0]).toMatchObject({ used: 4, cap: 5 });
      const exhausted = error.mock.calls.filter(
        ([obj]) => (obj as { stage?: string }).stage === 'exhausted',
      );
      expect(exhausted).toHaveLength(1);
    });

    it('fails CLOSED when Redis is unreachable', async () => {
      const deadRedis = new Redis('redis://127.0.0.1:1', {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 0,
      });
      const logger = {
        setContext: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      const isolated = new CostGuardService(
        deadRedis,
        app.get(AppConfigService),
        app.get(ConfigService),
        logger as never,
      );
      await expect(isolated.consume('sms')).rejects.toMatchObject({
        status: 503,
      });
      deadRedis.disconnect();
    });
  });

  // -----------------------------------------------------------------
  describe('POST /auth/otp/request cost protection', () => {
    it('trust proxy: per-IP throttling follows X-Forwarded-For', async () => {
      const res1 = await api()
        .post('/api/v1/auth/otp/request')
        .set('X-Forwarded-For', '203.0.113.8')
        .send({ channel: 'phone', identifier: '+13125550140' });
      const res2 = await api()
        .post('/api/v1/auth/otp/request')
        .set('X-Forwarded-For', '203.0.113.9')
        .send({ channel: 'phone', identifier: '+13125550141' });
      // Different forwarded client IPs -> separate throttler buckets.
      expect(res1.headers['x-ratelimit-remaining']).toBe('99');
      expect(res2.headers['x-ratelimit-remaining']).toBe('99');
    });

    it('rejects non-US and premium/toll-free numbers with PHONE_COUNTRY_NOT_SUPPORTED and spends nothing', async () => {
      for (const identifier of [
        '+14165550123', // Canada
        '+18765550123', // Jamaica (NANP Caribbean)
        '+447911123456', // UK
        '+19005551234', // US premium rate
      ]) {
        const res = await otpRequest(identifier);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('PHONE_COUNTRY_NOT_SUPPORTED');
      }
      expect(
        await redis.get(costCounterKey('sms', 'daily', new Date())),
      ).toBeNull();
    });

    it('allows a country the owner adds via app_config', async () => {
      await setAppConfig('sms.allowed_country_codes', ['US', 'PR']);
      const res = await otpRequest('+17875550123');
      expect(res.status).toBe(200);
    });

    it('returns 503 PROVIDER_BUDGET_EXCEEDED once the daily SMS cap (from app_config) is spent', async () => {
      await setAppConfig('budget.sms.daily_max', 2);
      expect((await otpRequest('+13125550150')).status).toBe(200);
      expect((await otpRequest('+13125550151')).status).toBe(200);
      const res = await otpRequest('+13125550152');
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('PROVIDER_BUDGET_EXCEEDED');
      expect(res.body.error.details.retryAfterSeconds).toEqual(
        expect.any(Number),
      );
      expect(await redis.get(costCounterKey('sms', 'daily', new Date()))).toBe(
        '2',
      );
    });

    it('per-minute SMS velocity cap trips the breaker', async () => {
      await setAppConfig('budget.sms.per_minute_max', 1);
      // Pre-spend the current AND next minute so a minute rollover mid-test
      // can't make this flaky.
      const now = new Date();
      await redis.set(costCounterKey('sms', 'minute', now), '1', 'EX', 120);
      await redis.set(
        costCounterKey('sms', 'minute', new Date(now.getTime() + 60_000)),
        '1',
        'EX',
        180,
      );
      const res = await otpRequest('+13125550160');
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('PROVIDER_BUDGET_EXCEEDED');
    });

    it('limits OTP requests per X-Device-Id (10/hour) even across IPs and numbers', async () => {
      const device = { 'X-Device-Id': `device-${Date.now()}` };
      for (let i = 0; i < 10; i++) {
        const res = await otpRequest(`+1312555017${i}`, device);
        expect(res.status).toBe(200);
      }
      const res = await otpRequest('+13125550180', device);
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('AUTH_OTP_REQUEST_LIMIT');
    });
  });

  // -----------------------------------------------------------------
  describe('POST /users/me/contacts/request per-user limit', () => {
    it('allows 3 contact OTPs per hour per user, then 429', async () => {
      const phone = '+13125550190';
      await otpRequest(phone).expect(200);
      const login = await api()
        .post('/api/v1/auth/otp/verify')
        .set('X-Forwarded-For', nextIp())
        .send({ channel: 'phone', identifier: phone, code: FIXED_CODE })
        .expect(201);
      const accessToken = login.body.data.accessToken as string;

      const reauthToken = async (): Promise<string> => {
        await otpRequest(phone).expect(200);
        const res = await api()
          .post('/api/v1/auth/reauth')
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Forwarded-For', nextIp())
          .send({ method: 'otp', identifier: phone, code: FIXED_CODE });
        expect(res.status).toBe(201);
        return res.body.data.reauthToken as string;
      };

      const contactRequest = async (value: string) =>
        api()
          .post('/api/v1/users/me/contacts/request')
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Reauth-Token', await reauthToken())
          .set('X-Forwarded-For', nextIp())
          .send({ type: 'phone', value });

      for (let i = 0; i < 3; i++) {
        expect((await contactRequest(`+1312555020${i}`)).status).toBe(201);
      }
      const blocked = await contactRequest('+13125550209');
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('AUTH_OTP_REQUEST_LIMIT');
    });
  });
});
