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
import { reauthByPassword } from './support/password-reauth';

/**
 * Owner 2026-10-16: fewer SMS. A code goes only to a NEW number (once per
 * cooldown, at most N a day) and to reset a password; a registered number
 * is told to sign in with its password (or to set one). No switch brings the
 * passwordless sign-in code back (owner 2026-11-07).
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
  });

  afterAll(async () => {
    // Back to the suites' sign-up settings (e2e-global-setup).
    await setting('sms.resend_cooldown_seconds', 0);
    await setting('sms.registration_per_number_per_day', 100000);
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
  /** The dev code '000000' signs in only when a code was really sent. */
  const verifies = (identifier: string) =>
    api()
      .post('/api/v1/auth/otp/verify')
      .set('X-Device-Id', randomUUID())
      .send({ channel: 'phone', identifier, code: '000000' });
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

  it('S14-1: a registered number gets the SAME answer as a new one and no code; only phone/status says «use your password»', async () => {
    await setting('sms.resend_cooldown_seconds', 60);
    const phone = fresh();
    const user = await prisma.user.create({
      data: { role: 'client', phone_e164: phone, status: 'active' },
    });
    await prisma.userIdentifier.create({
      data: { user_id: user.id, provider: 'phone', provider_uid: phone },
    });
    const res = await otp(phone);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ sent: true });
    // Nothing was sent: not even the dev code verifies.
    const verify = await api()
      .post('/api/v1/auth/otp/verify')
      .set('X-Device-Id', randomUUID())
      .send({ channel: 'phone', identifier: phone, code: '000000' });
    expect(verify.status).toBe(401);
    expect(code(verify)?.code).toBe('AUTH_OTP_EXPIRED');
    // The cooldown applies to a registered number like to a new one, so not
    // even the 429 pattern tells them apart.
    const again = await otp(phone);
    expect(again.status).toBe(429);
    expect(code(again)?.code).toBe('RATE_LIMITED');
    // The app learns it from phone/status (a number WITH a password only).
    const status = () =>
      api()
        .post('/api/v1/auth/phone/status')
        .set('X-Device-Id', randomUUID())
        .send({ identifier: phone });
    expect((await status()).body.data).toEqual({
      registered: false,
      hasPassword: false,
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { password_hash: 'x'.repeat(20) },
    });
    expect((await status()).body.data).toEqual({
      registered: true,
      hasPassword: true,
    });
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

  it('owner 2026-11-07: not even the signed-in owner gets an SMS for a registered number (step-up is the password)', async () => {
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
    // S14-1: a stranger gets the same 200 but no code...
    const stranger = await otp(phone);
    expect(stranger.status).toBe(200);
    expect((await verifies(phone)).status).toBe(401);
    // ...and the signed-in owner gets none either (same 200, nothing sent).
    await redis.del(...(await redis.keys('*sms-resend*')));
    const mine = await otp(phone).set('Authorization', bearer);
    expect(mine.status).toBe(200);
    expect((await verifies(phone)).status).toBe(401);
  });
  it('owner rule sms-two-cases: a phone change is confirmed with the password, no SMS to the new number', async () => {
    const oldPhone = fresh();
    const newPhone = fresh();
    const user = await prisma.user.create({
      data: {
        role: 'client',
        phone_e164: oldPhone,
        phone_verified_at: new Date(),
        status: 'active',
      },
    });
    await prisma.userIdentifier.create({
      data: { user_id: user.id, provider: 'phone', provider_uid: oldPhone },
    });
    // An older session: a fresh sign-in would itself count as the step-up.
    const sid = randomUUID();
    await prisma.session.create({
      data: {
        user_id: user.id,
        session_chain_id: sid,
        refresh_hash: `sms-two-cases-${sid}`,
        platform: 'ios',
        expires_at: new Date(Date.now() + 86_400_000),
        created_at: new Date(Date.now() - 3_600_000),
      },
    });
    const auth = {
      Authorization: `Bearer ${app.get(TokenService).signAccessToken({
        sub: user.id,
        role: 'client',
        sid,
        verified: false,
        subscriptionStatus: 'none',
      })}`,
    };

    // The old code route refuses a phone (no SMS code for a change).
    const bySms = await api()
      .post('/api/v1/users/me/contacts/request')
      .set(auth)
      .send({ type: 'phone', value: newPhone });
    expect(bySms.status).toBe(400);
    expect(code(bySms)?.code).toBe('VALIDATION_ERROR');
    // A step-up SMS is refused too: the step-up is the password.
    const stepUpSms = await otp(oldPhone)
      .set(auth)
      .send({ channel: 'phone', identifier: oldPhone, purpose: 'reauth' });
    expect(stepUpSms.status).toBe(400);

    const noToken = await api()
      .post('/api/v1/users/me/phone')
      .set(auth)
      .send({ phone: newPhone });
    expect(noToken.status).toBe(403);
    expect(code(noToken)?.code).toBe('REAUTH_REQUIRED');

    const token = await reauthByPassword(app, base, auth, { userId: user.id });
    const changed = await api()
      .post('/api/v1/users/me/phone')
      .set(auth)
      .set('X-Reauth-Token', token)
      .send({ phone: newPhone });
    expect(changed.status).toBe(201);
    expect(changed.body.data).toEqual({ verified: true });

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { phone_e164: true, phone_verified_at: true },
    });
    expect(after.phone_e164).toBe(newPhone);
    expect(after.phone_verified_at).not.toBeNull();
    const phones = await prisma.userIdentifier.findMany({
      where: { user_id: user.id, provider: 'phone' },
      select: { provider_uid: true },
    });
    expect(phones).toEqual([{ provider_uid: newPhone }]);
    // Nothing was texted to either number: not even the dev code verifies.
    expect((await verifies(newPhone)).status).toBe(401);
    expect((await verifies(oldPhone)).status).toBe(401);
  });
});
