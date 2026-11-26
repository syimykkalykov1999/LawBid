import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { RedisThrottlerStorageService } from '../src/throttler/redis-throttler-storage.service';
import { USER_THROTTLE_DEFAULT } from '../src/throttler/throttle-limits';

/**
 * THIRD_PASS_A R2 (26.11): when the throttler cannot reach Redis it used to
 * let EVERY request through (`totalHits: 0`), so during a Redis outage
 * login, OTP and password reset had no brute-force limit. Now the same
 * per-minute limit is counted in the task's memory (@nestjs/throttler's
 * in-memory storage, the Envoy local + global pattern). Real app, only the
 * throttler's Redis call is made to fail.
 */
jest.setTimeout(60_000);

describe('global throttler with Redis down (e2e)', () => {
  let app: NestExpressApplication;
  let restore: () => void;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.TRUST_PROXY_HOPS = '1';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: true,
    });
    configureApp(app);
    await app.init();
    await app.listen(0, '127.0.0.1');
    const storage = app.get(RedisThrottlerStorageService);
    const spy = jest
      .spyOn(
        storage as unknown as { incrementOrThrow: () => Promise<never> },
        'incrementOrThrow',
      )
      .mockRejectedValue(new Error('ECONNREFUSED (Redis down)'));
    restore = () => spy.mockRestore();
  });

  afterAll(async () => {
    restore();
    await app.close();
  });

  it('one source is limited at the same per-minute limit; another source is not', async () => {
    const api = () => request(app.getHttpServer());
    const from = (ip: string) =>
      api().get('/api/v1/countries').set('X-Forwarded-For', ip);
    for (let i = 0; i < USER_THROTTLE_DEFAULT; i += 1) {
      const r = await from('203.0.113.77');
      expect(r.status).toBe(200);
    }
    const over = await from('203.0.113.77');
    expect(over.status).toBe(429);
    const other = await from('198.51.100.33');
    expect(other.status).toBe(200);
  });
});
