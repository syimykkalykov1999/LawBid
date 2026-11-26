import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * ASVS 5.0 V14.3.2 (STAGE2_SECURITY #18): a sensitive answer (here the
 * account's sessions) is `private, no-store`, so a browser never keeps it on
 * disk; the ETag stays, and the app's own If-None-Match still gets 304.
 * Before, every signed-in answer was `private, no-cache` (storable).
 */
describe('Sensitive answers are not stored (e2e)', () => {
  let app: NestExpressApplication;
  let token: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.init();
    const tail = String(Math.floor(Math.random() * 9000) + 1000);
    const identifier = `+1415556${tail}`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ channel: 'phone', identifier })
      .expect(200);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({
        channel: 'phone',
        identifier,
        code: '000000',
        deviceInfo: { deviceId: `nostore-${tail}`, platform: 'android' },
      })
      .expect(201);
    token = (res.body as { data: { accessToken: string } }).data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /auth/sessions: private, no-store, with an ETag that still answers 304', async () => {
    const first = await request(app.getHttpServer())
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(first.headers['cache-control']).toBe('private, no-store');
    expect(first.headers.vary).toMatch(/Authorization/);
    const etag = first.headers.etag as string | undefined;
    expect(etag).toBeTruthy();
    await request(app.getHttpServer())
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${token}`)
      .set('If-None-Match', etag!)
      .expect(304);
  });

  it('a non-sensitive signed-in answer keeps private, no-cache', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/config/bootstrap')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).not.toMatch(/no-store/);
  });
});
