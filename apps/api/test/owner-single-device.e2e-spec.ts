import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Owner 2026-10-01: one phone and one website per account at a time — a
 * second phone signs the first phone out (AUTH_SIGNED_IN_ELSEWHERE), a
 * browser sign-in leaves the phone signed in.
 */
jest.setTimeout(120_000);

describe('One account, one phone + one website (e2e)', () => {
  let app: INestApplication;
  let base = '';

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
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);
  // A valid NANP number: the exchange starts with 2–9 (a random 0/1 made
  // the number invalid → the run failed now and then).
  const phone = `+1312${2 + Math.floor(Math.random() * 8)}${String(
    Math.floor(Math.random() * 1e6),
  ).padStart(6, '0')}`;

  const warned: string[] = [];

  async function login(deviceId: string, platform: string) {
    await api()
      .post('/api/v1/auth/otp/request')
      .send({ channel: 'phone', identifier: phone })
      .expect(200);
    const r = await api().post('/api/v1/auth/otp/verify').send({
      channel: 'phone',
      identifier: phone,
      code: '000000',
      deviceInfo: { deviceId, platform },
    });
    if (r.status === 409) {
      // Another phone / browser is signed in: the app asks, then continues.
      expect(r.body.error.code).toBe('AUTH_OTHER_DEVICE_ACTIVE');
      expect(r.body.error.details).toHaveProperty('lastUsedAt');
      warned.push(deviceId);
      const c = await api()
        .post('/api/v1/auth/login/continue')
        .send({ pendingToken: r.body.error.details.pendingToken });
      expect(c.status).toBe(201);
      return c.body.data as { accessToken: string; refreshToken: string };
    }
    expect(r.status).toBeLessThan(300);
    return r.body.data as { accessToken: string; refreshToken: string };
  }
  const me = (token: string) =>
    api().get('/api/v1/users/me').set('Authorization', `Bearer ${token}`);

  it('a second phone signs the first one out; a website does not', async () => {
    const phoneA = await login('phone-a', 'ios');
    await me(phoneA.accessToken).expect(200);

    const web = await login('browser-1', 'web');
    await me(web.accessToken).expect(200);
    await me(phoneA.accessToken).expect(200);

    const phoneB = await login('phone-b', 'android');
    await me(phoneB.accessToken).expect(200);
    const kicked = await me(phoneA.accessToken).expect(401);
    expect(kicked.body.error.code).toBe('AUTH_SIGNED_IN_ELSEWHERE');
    const refresh = await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: phoneA.refreshToken })
      .expect(401);
    expect(refresh.body.error.code).toBe('AUTH_SIGNED_IN_ELSEWHERE');
    await me(web.accessToken).expect(200);
    // Only the second phone was warned (the website is a separate slot).
    expect(warned).toEqual(['phone-b']);
  });
});
