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
import { AnalyticsService } from '../src/modules/analytics/analytics.service';

/**
 * Owner 2026-10-15: own analytics. Opening the app counts a person once a
 * day (DAU/MAU); the admin sees the sign-up funnel, retention, churn and
 * what was bought.
 */
jest.setTimeout(90_000);

/**
 * Time, made explicit (flaky on CI 2026-10-27). "Today" is the UTC day of
 * `new Date()`, read at the moment of each request. A run that crossed UTC
 * midnight between the two opens of the first case, or between the first
 * and the second case, counted the person on two days (or found DAU of the
 * new day empty) and failed for no reason in the code. So `Date` alone is
 * pinned (every timer, socket and the database keep running normally) to
 * the real current time, moved at most to 15 minutes inside the UTC day;
 * `advanceTimers` lets it tick on, and a file takes seconds, so the whole
 * file stays inside ONE day whatever time the CI runs it.
 */
const DAY_MS = 24 * 3600 * 1000;
const MARGIN_MS = 15 * 60 * 1000;
function insideTheUtcDay(real: Date): Date {
  const sinceMidnight = real.getTime() % DAY_MS;
  const clamped = Math.min(
    Math.max(sinceMidnight, MARGIN_MS),
    DAY_MS - MARGIN_MS,
  );
  return new Date(real.getTime() - sinceMidnight + clamped);
}

describe('Own analytics (e2e)', () => {
  let app: INestApplication;
  let analytics: AnalyticsService;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    jest.useFakeTimers({
      now: insideTheUtcDay(new Date()),
      advanceTimers: true,
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    });
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
    analytics = app.get(AnalyticsService);
  });

  afterAll(async () => {
    await app.close();
    jest.useRealTimers();
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
    // The write is fire-and-forget for the request; wait for exactly those
    // writes (no sleeping, no polling), then look at the state itself.
    await analytics.idle();
    const rows = await prisma.userActivityDay.findMany({
      where: { user_id: { in: [a.id, b.id] } },
      select: { user_id: true, day: true },
    });
    const today = new Date().toISOString().slice(0, 10);
    expect(
      rows
        .map((r) => `${r.user_id}@${r.day.toISOString().slice(0, 10)}`)
        .sort(),
    ).toEqual([`${a.id}@${today}`, `${b.id}@${today}`].sort());
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
