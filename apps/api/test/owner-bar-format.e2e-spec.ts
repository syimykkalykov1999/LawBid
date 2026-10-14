import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import type Redis from 'ioredis';
import { DEFAULT_BAR_FORMATS } from '../src/modules/verification/bar-number-format';

/**
 * Owner 2026-10-14: a bar number must have its state's shape, and wrong ones
 * cool down in steps (3 wrong → 1 h → 12 h → 24 h), never a permanent block.
 */
jest.setTimeout(120_000);

describe('Bar number format and stepped cooldown (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let base = '';
  let tokens: TokenService;

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
    base = `http://127.0.0.1:${(app.getHttpServer() as Server).address() ? ((app.getHttpServer() as Server).address() as AddressInfo).port : 0}`;
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS_CLIENT);
    tokens = app.get(TokenService);
    await prisma.state.upsert({
      where: { code: 'MI' },
      create: { code: 'MI', name: 'Michigan', is_active: true },
      update: {},
    });
    // The real table for this suite (the global setup loosens it).
    await prisma.appConfig.deleteMany({
      where: { key: 'verification.bar_formats' },
    });
    await redis.del('config:app_config');
  });

  afterAll(async () => {
    // Back to the loose table the other suites rely on.
    const loose = Object.fromEntries(
      Object.keys(DEFAULT_BAR_FORMATS).map((state) => [
        state,
        { pattern: '^[A-Z0-9]{3,32}$', example: 'ABC123' },
      ]),
    );
    await prisma.appConfig.upsert({
      where: { key: 'verification.bar_formats' },
      create: { key: 'verification.bar_formats', value: JSON.stringify(loose) },
      update: { value: JSON.stringify(loose) },
    });
    await redis.del('config:app_config');
    await app.close();
  });

  async function attorney() {
    const u = await prisma.user.create({ data: { role: 'attorney' } });
    const username = `bf_${u.id.slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
      },
    });
    const auth = {
      Authorization: `Bearer ${tokens.signAccessToken({
        sub: u.id,
        role: 'attorney',
        sid: randomUUID(),
        verified: false,
        subscriptionStatus: 'none',
      })}`,
    };
    const draft = await request(base)
      .post('/api/v1/verification/requests')
      .set(auth)
      .expect(201);
    return { id: u.id, auth, requestId: draft.body.data.id as string };
  }

  const add = (
    a: { auth: Record<string, string>; requestId: string },
    stateCode: string,
    barNumber: string,
  ) =>
    request(base)
      .post(`/api/v1/verification/requests/${a.requestId}/licenses`)
      .set(a.auth)
      .send({ stateCode, barNumber });

  it("a number must fit the state's shape; a good one is stored without separators", async () => {
    const a = await attorney();
    const bad = await add(a, 'MI', '12345');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('BAR_NUMBER_FORMAT_INVALID');
    // Owner 2026-10-14: the shape is never revealed to the client.
    expect(bad.body.error.details).toEqual({ stateCode: 'MI' });
    const ok = await add(a, 'MI', 'p-12345');
    expect(ok.status).toBe(201);
    const row = await prisma.attorneyLicense.findFirstOrThrow({
      where: { attorney_id: a.id },
    });
    expect(row.bar_number).toBe('P12345');
    await redis.flushdb();
  });

  it('three wrong numbers → 1 hour; the next three → 12 hours; then 24 hours, never forever', async () => {
    const a = await attorney();
    await redis.flushdb();
    for (let i = 0; i < 2; i += 1) {
      expect((await add(a, 'NY', 'ABC')).body.error.code).toBe(
        'BAR_NUMBER_FORMAT_INVALID',
      );
    }
    const third = await add(a, 'NY', 'ABC');
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('BAR_ATTEMPTS_COOLDOWN');
    expect(third.body.error.details.retryAfterSeconds).toBe(3600);
    // Even a right number waits out the cooldown.
    expect((await add(a, 'NY', '1234567')).status).toBe(429);
    // Time passes (the cooldown key ends), the counter stays.
    await redis.del(
      `bar:cool:u:${a.id}`,
      'bar:cool:ip:127.0.0.1',
      'bar:cool:ip:::ffff:127.0.0.1',
    );
    for (let i = 0; i < 2; i += 1) await add(a, 'NY', 'ABC');
    const sixth = await add(a, 'NY', 'ABC');
    expect(sixth.body.error.details.retryAfterSeconds).toBe(12 * 3600);
    await redis.del(
      `bar:cool:u:${a.id}`,
      'bar:cool:ip:127.0.0.1',
      'bar:cool:ip:::ffff:127.0.0.1',
    );
    for (let i = 0; i < 2; i += 1) await add(a, 'NY', 'ABC');
    const ninth = await add(a, 'NY', 'ABC');
    expect(ninth.body.error.details.retryAfterSeconds).toBe(24 * 3600);
    await redis.flushdb();
  });
});
