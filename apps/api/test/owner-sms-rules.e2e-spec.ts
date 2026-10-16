import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-10-16: fewer SMS. A code goes only to a NEW number (once per
 * cooldown, at most N a day) and to reset a password; a registered number
 * is told to sign in with its password (or to set one). `sms.login_code_enabled`
 * brings the old behaviour back.
 */
jest.setTimeout(90_000);

describe('SMS only for new numbers and password reset (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let base = '';
  let seq = 0;

  const setting = async (key: string, value: unknown) => {
    await prisma.appConfig.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    });
    await redis.del('config:app_config');
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
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS_CLIENT);
    await setting('sms.login_code_enabled', false);
  });

  afterAll(async () => {
    await setting('sms.login_code_enabled', true);
    await app.close();
  });

  const api = () => request(base);
  const fresh = () =>
    `+1415556${String(1000 + (seq += 1) + (Date.now() % 7000)).padStart(4, '0')}`;
  const otp = (identifier: string) =>
    api()
      .post('/api/v1/auth/otp/request')
      .set('X-Device-Id', randomUUID())
      .send({ channel: 'phone', identifier });
  const code = (res: request.Response) =>
    (
      res.body as {
        error?: { code: string; details?: Record<string, unknown> };
      }
    ).error;

  it('a new number gets a registration code, then waits for the cooldown', async () => {
    await setting('sms.resend_cooldown_seconds', 60);
    const phone = fresh();
    expect((await otp(phone)).status).toBe(200);
    const again = await otp(phone);
    expect(again.status).toBe(429);
    expect(code(again)?.code).toBe('RATE_LIMITED');
    expect(code(again)?.details?.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('at most N registration codes a day to one number', async () => {
    await setting('sms.resend_cooldown_seconds', 10);
    await setting('sms.registration_per_number_per_day', 2);
    const phone = fresh();
    for (let i = 0; i < 2; i += 1) {
      expect((await otp(phone)).status).toBe(200);
      // the cooldown window of this number, cleared so the day cap shows
      await redis.del(...(await redis.keys('*sms-resend*')));
    }
    const third = await otp(phone);
    expect(third.status).toBe(429);
    expect(code(third)?.code).toBe('AUTH_OTP_REQUEST_LIMIT');
    await setting('sms.registration_per_number_per_day', 3);
  });

  it('a registered number gets no code: «use your password»', async () => {
    const phone = fresh();
    const user = await prisma.user.create({
      data: { role: 'client', phone_e164: phone, status: 'active' },
    });
    await prisma.userIdentifier.create({
      data: { user_id: user.id, provider: 'phone', provider_uid: phone },
    });
    const res = await otp(phone);
    expect(res.status).toBe(409);
    expect(code(res)?.code).toBe('AUTH_PHONE_REGISTERED');
    expect(code(res)?.details?.hasPassword).toBe(false);
    await prisma.user.update({
      where: { id: user.id },
      data: { password_hash: 'x'.repeat(20) },
    });
    const withPassword = await otp(phone);
    expect(code(withPassword)?.details?.hasPassword).toBe(true);
  });

  it('password reset: at most the hourly cap, and the daily one', async () => {
    await setting('sms.reset_per_number_per_hour', 2);
    await setting('sms.reset_per_number_per_day', 5);
    const phone = fresh();
    const user = await prisma.user.create({
      data: { role: 'client', phone_e164: phone, status: 'active' },
    });
    await prisma.userIdentifier.create({
      data: { user_id: user.id, provider: 'phone', provider_uid: phone },
    });
    const reset = () =>
      api()
        .post('/api/v1/auth/password/reset/request')
        .set('X-Device-Id', randomUUID())
        .send({ identifier: phone });
    expect((await reset()).status).toBe(200);
    expect((await reset()).status).toBe(200);
    const third = await reset();
    expect(third.status).toBe(429);
    expect(code(third)?.code).toBe('RATE_LIMITED');
    await setting('sms.reset_per_number_per_hour', 3);
  });

  it('the rollback switch brings the old sign-in code back', async () => {
    const phone = fresh();
    const user = await prisma.user.create({
      data: { role: 'client', phone_e164: phone, status: 'active' },
    });
    await prisma.userIdentifier.create({
      data: { user_id: user.id, provider: 'phone', provider_uid: phone },
    });
    expect((await otp(phone)).status).toBe(409);
    await setting('sms.login_code_enabled', true);
    expect((await otp(phone)).status).toBe(200);
    await setting('sms.login_code_enabled', false);
  });

  it('the signed-in owner of a number may ask a code for it (reauthentication); a stranger may not', async () => {
    const phone = fresh();
    const user = await prisma.user.create({
      data: { role: 'client', phone_e164: phone, status: 'active' },
    });
    await prisma.userIdentifier.create({
      data: { user_id: user.id, provider: 'phone', provider_uid: phone },
    });
    const bearer = `Bearer ${app.get(TokenService).signAccessToken({
      sub: user.id,
      role: 'client',
      sid: randomUUID(),
      verified: false,
      subscriptionStatus: 'none',
    })}`;
    const mine = await otp(phone).set('Authorization', bearer);
    expect(mine.status).toBe(200);
    const stranger = await otp(phone);
    expect(stranger.status).toBe(409);
  });
});
