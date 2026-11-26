import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * STAGE2_SECURITY O4 (ASVS 5.0 V6.3.8): a registered and an unknown number
 * get their phone/status answer after the same minimum time
 * (`security.phone_status_min_ms`, 150 ms by default), so the timing says
 * nothing beyond the answer. Before, the answer came as fast as the lookup.
 */
describe('phone/status answers in uniform time (e2e)', () => {
  let app: NestExpressApplication;
  const tail = () => String(Math.floor(Math.random() * 9000) + 1000);
  const registered = `+1415557${tail()}`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.TRUST_PROXY_HOPS = '1';
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
    await request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ channel: 'phone', identifier: registered })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({
        channel: 'phone',
        identifier: registered,
        code: '000000',
        deviceInfo: { deviceId: `o4-${tail()}`, platform: 'android' },
      })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  async function timed(identifier: string, ip: string) {
    const t0 = performance.now();
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/phone/status')
      .set('X-Forwarded-For', ip)
      .send({ identifier });
    return { ms: performance.now() - t0, res };
  }

  it('a registered and an unknown number both take at least the floor', async () => {
    const known = await timed(registered, '198.51.100.71');
    const unknown = await timed(`+1415558${tail()}`, '198.51.100.72');
    expect(known.res.status).toBe(200);
    expect(unknown.res.status).toBe(200);
    expect(known.res.body.data.registered).toBe(true);
    expect(unknown.res.body.data.registered).toBe(false);
    expect(known.ms).toBeGreaterThanOrEqual(145);
    expect(unknown.ms).toBeGreaterThanOrEqual(145);
  });
});
