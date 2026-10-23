import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import type Redis from 'ioredis';
import { adminSession } from './support/admin-login';

/**
 * Admin endpoints on a big database (owner 2026-10-23, admin economy pass).
 * Only runs with PERF_ADMIN=1 against a database filled by
 * scripts/ops/admin-load-gen.sql. Prints, per endpoint: the first call with
 * the admin caches empty ("cold": what one refresh of a cached aggregate
 * costs), then p50 / p95 / max of the repeat calls ("warm": what the admin
 * panel actually waits for, every poll and every page open).
 *
 *   PERF_ADMIN=1 E2E_DATABASE_URL=postgresql://root:lawbid@localhost:5432/lawbid_perf \
 *     npx jest --config test/jest-perf-admin.json --forceExit
 */
const RUN = process.env.PERF_ADMIN === '1';
const ROUNDS = Number(process.env.PERF_ROUNDS ?? 20);
jest.setTimeout(30 * 60_000);

const ENDPOINTS: [string, string][] = [
  ['counts (sidebar poll)', '/admin/counts'],
  ['dashboard', '/admin/dashboard'],
  ['overview (content)', '/admin/overview'],
  ['billing overview', '/admin/billing/overview'],
  ['users: first page', '/admin/users?limit=50'],
  ['users: search by name', '/admin/users?q=sofia%20hernandez&limit=50'],
  [
    'users: filter attorney+country',
    '/admin/users?role=attorney&countryCode=GB&limit=50',
  ],
  ['subscriptions: page', '/admin/billing/subscriptions'],
  ['subscriptions: search', '/admin/billing/subscriptions?q=sofia'],
  ['payments', '/admin/billing/payments'],
  [
    'content: posts search (word in 1/3 of posts)',
    '/admin/content/posts?q=visa',
  ],
  ['content: posts search (rare word)', '/admin/content/posts?q=4711'],
  ['bids: search by case', '/admin/bids?q=landlord'],
  ['audit log', '/admin/audit-log'],
  ['trust stats', '/admin/trust/stats'],
  ['trust queue', '/admin/trust/queue'],
  ['fraud stats', '/admin/fraud/stats'],
  ['support stats', '/admin/support/stats'],
  ['support tickets', '/admin/support/tickets'],
  ['moderation queue', '/admin/moderation/queue'],
  ['bans: search', '/admin/sanctions/bans?q=banned1'],
  ['cases list', '/admin/cases'],
  ['cases: title search (every title)', '/admin/cases?q=landlord'],
  ['cases: title search (rare)', '/admin/cases?q=case%204711'],
  ['cases: by status', '/admin/cases?status=open'],
  ['bids: by status', '/admin/bids?status=active'],
  ['payroll summary', '/admin/payroll/summary?period=2026-10'],
];

(RUN ? describe : describe.skip)('Admin endpoints on a big database', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
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
    redis = app.get<Redis>(REDIS_CLIENT);
  });

  afterAll(async () => {
    await app.close();
  });

  const pct = (xs: number[], p: number) =>
    [...xs].sort((a, b) => a - b)[
      Math.min(xs.length - 1, Math.floor(xs.length * p))
    ];

  it('prints the latency table', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    const rows: string[] = [
      '| endpoint | status | cold ms | warm p50 | warm p95 | warm max | bytes |',
      '|---|---|---|---|---|---|---|',
    ];
    for (const [label, path] of ENDPOINTS) {
      if (process.env.PERF_ONLY && !path.includes(process.env.PERF_ONLY))
        continue;
      // Empty every admin cache so the first call is a real cold one.
      // (Only the aggregate caches: `adm:*` also holds the admin sessions.)
      const keys = [
        ...(await redis.keys('adm:sum:*')),
        ...(await redis.keys('adm:counts:*')),
      ];
      if (keys.length) await redis.del(...keys);
      const times: number[] = [];
      let status = 0;
      let bytes = 0;
      let cold = 0;
      for (let i = 0; i <= ROUNDS; i++) {
        const t0 = process.hrtime.bigint();
        const res = await request(base).get(`/api/v1${path}`).set(admin.auth);
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        status = res.status;
        bytes = Buffer.byteLength(JSON.stringify(res.body ?? {}));
        if (i === 0) cold = ms;
        else times.push(ms);
      }
      const f = (n: number) => n.toFixed(1);
      rows.push(
        `| ${label} \`${path}\` | ${status} | ${f(cold)} | ${f(pct(times, 0.5))} | ${f(pct(times, 0.95))} | ${f(Math.max(...times))} | ${bytes} |`,
      );
    }

    console.log(`\n${rows.join('\n')}\n`);
  });
});
