import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import type Redis from 'ioredis';
import { dropAppConfigCache } from '../src/modules/feature-flags/services/app-config.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { phoneSignIn } from './support/password-login';

/**
 * STAGE2_SECURITY #12 (ASVS 5.0 V7.5.2): ending other sessions needs a
 * fresh re-authentication (a sign-in within 10 minutes, or X-Reauth-Token);
 * the website is always held to it, phone apps from
 * `security.session_end_reauth_min_app_version` on.
 * STAGE2_SECURITY #13 (ASVS 5.0 V7.3.2 / V10.4.8): a refresh chain older
 * than `auth.session_absolute_days` is refused (AUTH_REFRESH… expired) and
 * ended, however often it was refreshed.
 */
describe('session re-auth and absolute lifetime (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let redis: Redis;
  const tail = () => String(Math.floor(Math.random() * 9000) + 1000);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: true,
    });
    configureApp(app);
    await app.init();
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS_CLIENT);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  async function signIn(phone: string, platform: string) {
    const res = await phoneSignIn(app, app.getHttpServer(), phone, {
      deviceId: `${platform}-${phone}`,
      platform,
    });
    expect(res.status).toBe(201);
    return res.body.data as { accessToken: string; refreshToken: string };
  }

  /** Makes every session row of [phone]'s chains look [minutes] old. */
  async function age(phone: string, minutes: number, startedDaysAgo?: number) {
    const user = await prisma.user.findFirstOrThrow({
      where: { phone_e164: phone },
      select: { id: true },
    });
    const at = new Date(Date.now() - minutes * 60_000);
    await prisma.session.updateMany({
      where: { user_id: user.id },
      data: {
        created_at: at,
        ...(startedDaysAgo === undefined
          ? {}
          : {
              chain_started_at: new Date(
                Date.now() - startedDaysAgo * 86_400_000,
              ),
            }),
      },
    });
  }

  it('#12: the website must re-authenticate to sign out other devices', async () => {
    const phone = `+1202556${tail()}`;
    await signIn(phone, 'ios');
    const web = await signIn(phone, 'web');
    await age(phone, 30);
    const res = await api()
      .post('/api/v1/auth/logout-others')
      .set('Authorization', `Bearer ${web.accessToken}`)
      .set('X-Platform', 'web');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('REAUTH_REQUIRED');
  });

  it('#12: a fresh sign-in counts as the re-auth', async () => {
    const phone = `+1202557${tail()}`;
    await signIn(phone, 'ios');
    const web = await signIn(phone, 'web');
    const res = await api()
      .post('/api/v1/auth/logout-others')
      .set('Authorization', `Bearer ${web.accessToken}`)
      .set('X-Platform', 'web');
    expect(res.status).toBe(200);
  });

  it('#12: a phone app from the configured version on must re-authenticate; an older one still can', async () => {
    const phone = `+1202558${tail()}`;
    const ios = await signIn(phone, 'ios');
    await signIn(phone, 'web');
    await age(phone, 30);
    await prisma.appConfig.upsert({
      where: { key: 'security.session_end_reauth_min_app_version' },
      create: {
        key: 'security.session_end_reauth_min_app_version',
        value: '2.0.0' as never,
      },
      update: { value: '2.0.0' as never },
    });
    await dropAppConfigCache(redis);
    try {
      const sessions = await api()
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${ios.accessToken}`)
        .expect(200);
      const other = (
        sessions.body.data as { sessionId: string; isCurrent: boolean }[]
      ).find((s) => !s.isCurrent)!;
      const fresh = await api()
        .delete(`/api/v1/auth/sessions/${other.sessionId}`)
        .set('Authorization', `Bearer ${ios.accessToken}`)
        .set('X-Platform', 'ios')
        .set('X-App-Version', '2.1.0');
      expect(fresh.status).toBe(403);
      expect(fresh.body.error.code).toBe('REAUTH_REQUIRED');
      const old = await api()
        .delete(`/api/v1/auth/sessions/${other.sessionId}`)
        .set('Authorization', `Bearer ${ios.accessToken}`)
        .set('X-Platform', 'ios')
        .set('X-App-Version', '1.9.0');
      expect(old.status).toBe(200);
    } finally {
      await prisma.appConfig.deleteMany({
        where: { key: 'security.session_end_reauth_min_app_version' },
      });
      await dropAppConfigCache(redis);
    }
  });

  it('#13: a chain older than the absolute lifetime cannot refresh, and ends', async () => {
    const phone = `+1202559${tail()}`;
    const ios = await signIn(phone, 'ios');
    await age(phone, 5, 400);
    const res = await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: ios.refreshToken });
    expect(res.status).toBe(401);
    const user = await prisma.user.findFirstOrThrow({
      where: { phone_e164: phone },
      select: { id: true },
    });
    expect(
      await prisma.session.count({
        where: { user_id: user.id, revoked_at: null },
      }),
    ).toBe(0);
  });

  it('#13: inside the lifetime a refresh works and keeps the chain start', async () => {
    const phone = `+1202550${tail()}`;
    const ios = await signIn(phone, 'ios');
    await age(phone, 5, 10);
    const res = await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: ios.refreshToken });
    expect([200, 201]).toContain(res.status);
    const user = await prisma.user.findFirstOrThrow({
      where: { phone_e164: phone },
      select: { id: true },
    });
    const live = await prisma.session.findFirstOrThrow({
      where: { user_id: user.id, revoked_at: null },
    });
    const days = (Date.now() - live.chain_started_at!.getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(9.9);
    expect(days).toBeLessThan(10.1);
  });
});
