import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { ErrorCode } from '../src/common/errors/error-code.enum';
import { SecretsService } from '../src/common/secrets/secrets.service';
import { AppCheckService } from '../src/modules/auth/app-check/app-check.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

/**
 * Security research #5 (2026-10-22), A4: Firebase App Check on the costly
 * anonymous routes, by `security.app_check.mode`. Real PostgreSQL + Redis;
 * the Admin SDK's signature check (needs Firebase's public keys over the
 * network) is replaced by a fake project whose verifier accepts one
 * token — the guard's decisions are what is under test.
 */
describe('App Check (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let ipCounter = 0;
  const nextIp = () => `203.0.113.${(ipCounter++ % 250) + 1}`;
  const api = () => request(app.getHttpServer());

  async function setMode(mode: string | null): Promise<void> {
    const key = 'security.app_check.mode';
    if (mode === null) await prisma.appConfig.deleteMany({ where: { key } });
    else
      await prisma.appConfig.upsert({
        where: { key },
        create: { key, value: mode },
        update: { value: mode },
      });
    await redis.del('config:app_config'); // bypass the 30 s cache
  }

  function otp(
    body: Record<string, unknown>,
    headers: Record<string, string> = {},
  ) {
    const req = api()
      .post('/api/v1/auth/otp/request')
      .set('X-Forwarded-For', nextIp());
    for (const [k, v] of Object.entries(headers)) req.set(k, v);
    return req.send(body);
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AppCheckService)
      .useValue({
        verify: (token: string | undefined) =>
          Promise.resolve(
            !token
              ? { verdict: 'missing' }
              : token === 'good-token'
                ? { verdict: 'valid', appId: '1:1:ios:test' }
                : { verdict: 'invalid', reason: 'test' },
          ),
      })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: true,
    });
    configureApp(app);
    app.set('trust proxy', 1);
    await app.init();
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS_CLIENT);
  });

  afterAll(async () => {
    await setMode(null);
    await app.close();
  });

  const phone = () =>
    `+1415555${String(1000 + Math.floor(Math.random() * 9000))}`;

  it('monitor (default): a request without the header is served', async () => {
    await setMode(null);
    const res = await otp({ channel: 'phone', identifier: phone() });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ sent: true });
  });

  it('enforce: no header → 403 DEVICE_ATTESTATION_REQUIRED for an SMS code', async () => {
    await setMode('enforce');
    const res = await otp({ channel: 'phone', identifier: phone() });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ErrorCode.DEVICE_ATTESTATION_REQUIRED);
  });

  it('enforce: a forged header → 403 too', async () => {
    await setMode('enforce');
    const res = await otp(
      { channel: 'phone', identifier: phone() },
      { 'X-Firebase-AppCheck': 'forged' },
    );
    expect(res.status).toBe(403);
  });

  it('enforce: the app token passes', async () => {
    await setMode('enforce');
    const res = await otp(
      { channel: 'phone', identifier: phone() },
      { 'X-Firebase-AppCheck': 'good-token' },
    );
    expect(res.status).toBe(200);
  });

  it('enforce: a code by e-mail stays free (no SMS money at stake)', async () => {
    await setMode('enforce');
    const res = await otp({
      channel: 'email',
      identifier: `appcheck-${Date.now()}@example.com`,
    });
    expect(res.status).toBe(200);
  });

  it('enforce: a password reset (an SMS) needs the token', async () => {
    await setMode('enforce');
    const byPhone = await api()
      .post('/api/v1/auth/password/reset/request')
      .set('X-Forwarded-For', nextIp())
      .send({ identifier: phone() });
    expect(byPhone.status).toBe(403);
    const withToken = await api()
      .post('/api/v1/auth/password/reset/request')
      .set('X-Forwarded-For', nextIp())
      .set('X-Firebase-AppCheck', 'good-token')
      .send({ identifier: phone() });
    expect(withToken.status).not.toBe(403);
  });

  it('enforce: the phone-status check needs the token', async () => {
    await setMode('enforce');
    const res = await api()
      .post('/api/v1/auth/phone/status')
      .set('X-Forwarded-For', nextIp())
      .send({ identifier: phone() });
    expect(res.status).toBe(403);
  });

  it('off: nothing is looked at', async () => {
    await setMode('off');
    const res = await otp({ channel: 'phone', identifier: phone() });
    expect(res.status).toBe(200);
  });

  it('the real verifier reports "unconfigured" without Firebase keys', async () => {
    const secrets = app.get(SecretsService);
    const service = new AppCheckService(secrets, {
      setContext: () => undefined,
      info: () => undefined,
    } as never);
    jest.spyOn(secrets, 'get').mockResolvedValueOnce(null);
    await expect(service.verify('anything')).resolves.toEqual({
      verdict: 'unconfigured',
    });
  });
});
