import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { adminSession } from './support/admin-login';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

/**
 * Owner 2026-10-15: own analytics. Opening the app counts a person once a
 * day (DAU/MAU); the admin sees the sign-up funnel, retention, churn and
 * what was bought.
 */
jest.setTimeout(90_000);

describe('Own analytics (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
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
    base = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);
  const as = (id: string, role: 'client' | 'attorney') => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: false,
      subscriptionStatus: 'none',
    })}`,
  });
  const waitFor = async (check: () => Promise<boolean>) => {
    for (let i = 0; i < 50; i += 1) {
      if (await check()) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  };

  it('opening the app counts a person once a day', async () => {
    const a = await prisma.user.create({
      data: { role: 'client', phone_verified_at: new Date() },
    });
    const b = await prisma.user.create({ data: { role: 'attorney' } });
    for (const [u, role] of [
      [a, 'client'],
      [a, 'client'],
      [b, 'attorney'],
    ] as const) {
      await api().get('/api/v1/users/me').set(as(u.id, role)).expect(200);
    }
    const counted = await waitFor(
      async () =>
        (await prisma.userActivityDay.count({
          where: { user_id: { in: [a.id, b.id] } },
        })) === 2,
    );
    expect(counted).toBe(true);
  });

  it('the admin sees DAU/MAU, the funnel, retention, churn and purchases', async () => {
    // The page reads the stored snapshot (#377); another suite may have
    // stored one before this suite's activity rows existed.
    await app.get<Redis>(REDIS_CLIENT).del('adm:sum:analytics:30');
    const admin = await adminSession(base, prisma, 'super_admin');
    const r = await api()
      .get('/api/v1/admin/analytics')
      .query({ days: 30 })
      .set(admin.auth)
      .expect(200);
    const d = r.body.data as {
      dau: number;
      mau: number;
      stickinessPercent: number;
      funnel: { key: string; count: number }[];
      retention: { cohort: number };
      churn: { clients: { before: number } };
      daily: { day: string; active: number }[];
    };
    expect(d.dau).toBeGreaterThanOrEqual(2);
    expect(d.mau).toBeGreaterThanOrEqual(d.dau);
    expect(d.funnel.map((s) => s.key)).toEqual([
      'signed_up',
      'verified',
      'role_chosen',
      'onboarded',
      'first_action',
      'paid',
    ]);
    // Each later step is a subset of the people before it.
    expect(d.funnel[0].count).toBeGreaterThanOrEqual(d.funnel[2].count);
    expect(d.daily).toHaveLength(30);
    expect(d.daily[29].active).toBeGreaterThanOrEqual(2);
  });

  it('a section the admin has no right to looks absent', async () => {
    const support = await adminSession(base, prisma, 'support');
    await api().get('/api/v1/admin/analytics').set(support.auth).expect(404);
  });
});
