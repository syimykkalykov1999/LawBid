import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { LoadSheddingService } from '../src/common/resilience/load-shedding';
import { dropAppConfigCache } from '../src/modules/feature-flags/services/app-config.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

/**
 * Item 21 (A3 / AU2, 25.11): prioritized load shedding (Netflix). Under a
 * synthetic overload of one instance, background and prefetch requests get
 * 503 SERVER_BUSY + Retry-After while sign-in passes; critical requests are
 * shed only at the top threshold; every threshold and the mode come from the
 * admin settings (app_config), read live. The jest runner keeps the lag/CPU
 * sampler inert, so the test sets the measured values itself.
 */
jest.setTimeout(90_000);

const KEYS = [
  'realtime.server.shed_mode',
  'realtime.server.shed_cpu_start_pct',
  'realtime.server.shed_cpu_critical_pct',
  'realtime.server.shed_max_in_flight',
];

describe('Prioritized load shedding (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let shed: LoadSheddingService;
  let base = '';

  const setConfig = async (values: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(values)) {
      await prisma.appConfig.upsert({
        where: { key },
        create: { key, value: value as never },
        update: { value: value as never },
      });
    }
    await dropAppConfigCache(redis);
    await shed.loadLimits();
  };

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
    app.setGlobalPrefix('api/v1', {
      exclude: ['/health/live', '/health/ready', '/docs', '/docs-json'],
    });
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS_CLIENT);
    shed = app.get(LoadSheddingService);
  });

  afterEach(() => {
    shed.cpuPct = 0;
    shed.lagMs = 0;
  });

  afterAll(async () => {
    await prisma.appConfig.deleteMany({ where: { key: { in: KEYS } } });
    await dropAppConfigCache(redis);
    await app.close();
  });

  const appEvent = () =>
    request(base)
      .post('/api/v1/app-events')
      .send({ events: [] })
      .set('Content-Type', 'application/json');
  const login = () =>
    request(base)
      .post('/api/v1/auth/password/login')
      .send({ phone: '+15550000000', password: 'wrong-password-1' });

  it('a calm server sheds nothing', async () => {
    await setConfig({ 'realtime.server.shed_mode': 'on' });
    expect((await appEvent()).status).not.toBe(503);
    expect((await login()).status).not.toBe(503);
  });

  it('CPU above the start: background and prefetch wait, sign-in passes', async () => {
    await setConfig({
      'realtime.server.shed_mode': 'on',
      'realtime.server.shed_cpu_start_pct': 60,
      'realtime.server.shed_cpu_critical_pct': 95,
    });
    // Thresholds: bulk 60, best effort ~71.7, normal ~83.3, critical 95.
    shed.cpuPct = 75;
    const before = shed.shed;

    const bg = await appEvent();
    expect(bg.status).toBe(503);
    expect(Number(bg.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(bg.body).toMatchObject({
      error: {
        code: 'SERVER_BUSY',
        details: { priority: 'bulk', reason: 'cpu', notProcessed: true },
      },
    });

    // Suggestions while typing (best effort), shed before the token check.
    const suggest = await request(base).get('/api/v1/search/suggest?q=law');
    expect(suggest.status).toBe(503);

    // The app marked a feed call as prefetch: it waits too.
    const prefetch = await request(base)
      .get('/api/v1/feed')
      .set('X-Request-Priority', 'prefetch');
    expect(prefetch.status).toBe(503);
    expect(prefetch.body.error.details.priority).toBe('best_effort');

    // The same feed request without the mark is served.
    expect((await request(base).get('/api/v1/feed')).status).not.toBe(503);
    // The shedder answers before the JWT guard: a signed-in-only route
    // marked background is 503, not 401.
    const me = await request(base)
      .get('/api/v1/users/me')
      .set('X-Request-Priority', 'background');
    expect(me.status).toBe(503);
    expect((await request(base).get('/api/v1/users/me')).status).toBe(401);
    // Sign-in (critical) is answered by the auth code, not shed.
    expect((await login()).status).not.toBe(503);
    // Health checks are never shed.
    expect((await request(base).get('/health/live')).status).toBe(200);
    expect(shed.shed - before).toBe(4);
  });

  it('critical requests are shed only at the critical threshold', async () => {
    await setConfig({
      'realtime.server.shed_mode': 'on',
      'realtime.server.shed_cpu_start_pct': 60,
      'realtime.server.shed_cpu_critical_pct': 90,
    });
    shed.cpuPct = 89;
    expect((await login()).status).not.toBe(503);
    shed.cpuPct = 96;
    const res = await login();
    expect(res.status).toBe(503);
    expect(res.body.error.details.priority).toBe('critical');
  });

  it('Вкл: a fixed in-flight limit sheds background at 70 % of it, sign-in at the limit', async () => {
    await setConfig({
      'realtime.server.shed_mode': 'on',
      'realtime.server.shed_max_in_flight': 10,
    });
    const real = shed.inFlight;
    shed.inFlight = real + 8;
    try {
      const bg = await appEvent();
      expect(bg.status).toBe(503);
      expect(bg.body.error.details.reason).toBe('in_flight');
      expect((await login()).status).not.toBe(503);
    } finally {
      shed.inFlight -= 8;
    }
  });

  it('Выкл in the admin: nothing is shed, whatever the load', async () => {
    await setConfig({ 'realtime.server.shed_mode': 'off' });
    shed.cpuPct = 100;
    shed.lagMs = 10_000;
    expect((await appEvent()).status).not.toBe(503);
    expect((await login()).status).not.toBe(503);
  });
});
