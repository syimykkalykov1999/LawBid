import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LoggerErrorInterceptor, Logger } from 'nestjs-pino';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { FakeRedis } from './support/fake-redis';

/**
 * Stage 1.2 acceptance (docs/01_FOUNDATION_AUTH.md §15):
 * "e2e-тест: ошибка валидации возвращает формат из раздела 7; повтор
 * запроса с тем же Idempotency-Key возвращает тот же ответ."
 * Exercised against the dev-only /dev/echo endpoint (see
 * src/modules/dev/dev-echo.controller.ts) since no real feature endpoint
 * exists yet at this stage. Prisma and Redis are stubbed — the DB/queue
 * infra from docker-compose.yml isn't runnable in the build sandbox, and
 * neither dependency's *real* behavior is what this stage is testing.
 */
describe('AppModule (e2e) — stage 1.2 plumbing', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL ??=
      'postgresql://root@localhost:26257/lawbid_test?sslmode=disable';
    process.env.REDIS_URL ??= 'redis://localhost:6379';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(REDIS_CLIENT)
      .useValue(new FakeRedis())
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: () => Promise.resolve(),
        onModuleDestroy: () => Promise.resolve(),
        // GET /health/ready's database indicator runs SELECT 1.
        $queryRaw: () => Promise.resolve([{ '?column?': 1 }]),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useLogger(app.get(Logger));
    app.useGlobalInterceptors(new LoggerErrorInterceptor());
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/ready -> 200 (stage 1.1 acceptance, still holds)', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready');
    expect(res.status).toBe(200);
  });

  it('validation error matches docs/01_FOUNDATION_AUTH.md §7 error shape', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/dev/echo')
      .send({ message: 'hi' }); // missing required amountCents -> 400

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        message: expect.any(String),
        requestId: expect.any(String),
      },
    });
  });

  it('repeating a POST with the same Idempotency-Key replays the same response', async () => {
    const key = 'test-key-123';
    const payload = { message: 'hello', amountCents: 500 };

    const first = await request(app.getHttpServer())
      .post('/api/v1/dev/echo')
      .set('Idempotency-Key', key)
      .send(payload);

    const second = await request(app.getHttpServer())
      .post('/api/v1/dev/echo')
      .set('Idempotency-Key', key)
      .send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(first.status);
    expect(second.body).toEqual(first.body);
    // receivedId is randomUUID() per real invocation — identical body proves
    // the second call replayed the cached response instead of re-running
    // the handler (a fresh call would produce a different receivedId).
  });

  it('success responses are wrapped as {data, meta} per docs/01_FOUNDATION_AUTH.md §7', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/dev/echo')
      .set('Idempotency-Key', 'shape-check')
      .send({ message: 'shape', amountCents: 1 });

    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toMatchObject({ message: 'shape', amountCents: 1 });
  });
});
