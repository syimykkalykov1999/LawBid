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

/**
 * 2026-11-08 (owner: «админка тормозит даже без данных»): what one page open
 * really costs. The panel fires the shell's polls and every card's query of
 * a page AT ONCE, so on prod (one API task, DB_POOL_SIZE=3) the requests
 * queue for the three database connections; one endpoint alone is fast and
 * hides that. Each page below is opened PERF_PAGE_ROUNDS times: all its
 * GETs in parallel, as the browser sends them. Run with DB_POOL_SIZE=3 to
 * match prod; PERF_STALE=1 ages every stored board to 20 min before each
 * open (the panel opened after a pause). Fails when an endpoint's p95 is
 * over PERF_BUDGET_MS (300).
 *
 *   PERF_ADMIN=1 PERF_PAGES=1 PERF_STALE=1 DB_POOL_SIZE=3 E2E_DATABASE_URL=… \
 *     npx jest --config test/jest-perf-admin.json --forceExit
 */
const SHELL = [
  '/admin/auth/me',
  '/admin/counts',
  '/admin/feature-flags',
  '/admin/pii/watermark',
];
const ADMIN_PAGES: Record<string, string[]> = {
  Главная: ['/admin/overview', '/admin/billing/overview'],
  Сегодня: ['/admin/system-health', '/admin/pnl'],
  Масштаб: [
    '/admin/economy',
    '/admin/system-health',
    '/admin/system-health/scale',
    '/admin/spend/registry',
    '/admin/launch/budgets',
    '/admin/system-health/backfills',
    '/admin/system-health/db-replica',
    '/admin/system-health/partitions',
    '/admin/system-health/search-index',
    '/admin/shards/overview',
    '/admin/shards/split-plan?toDb=db1',
    '/admin/system-health/heavy-hitters',
    '/admin/infra',
  ],
  'Здоровье системы': [
    '/admin/system-health',
    '/admin/shards/overview',
    '/admin/shards/split-plan?toDb=db1',
  ],
  Расходы: ['/admin/spend', '/admin/spend/registry', '/admin/infra'],
  Интеграции: [
    '/admin/integrations',
    '/admin/system-health/calls-path',
    '/admin/config',
  ],
  Настройки: [
    '/admin/config',
    '/admin/config/budgets',
    '/admin/system-health/reco-qa',
  ],
  Пользователи: ['/admin/users?limit=50'],
  'Журнал действий': ['/admin/audit-log'],
  Дела: ['/admin/case-disputes', '/admin/contact-issues', '/admin/cases'],
  Платежи: [
    '/admin/billing/payments',
    '/admin/billing/refunds',
    '/admin/billing/duplicate-subscriptions',
    '/admin/billing/dispute-refunds',
  ],
};
const PAGE_ROUNDS = Number(process.env.PERF_PAGE_ROUNDS ?? 10);

(RUN && process.env.PERF_PAGES === '1' ? describe : describe.skip)(
  'Admin pages opened the way the browser opens them',
  () => {
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

    /** PERF_STALE=1: every stored admin board is made 20 min old before
     * each open — the owner's case, «I open the panel after a pause». */
    const ageBoards = async () => {
      if (process.env.PERF_STALE !== '1') return;
      const old = new Date(Date.now() - 20 * 60_000).toISOString();
      for (const k of await redis.keys('adm:sum:*')) {
        if (k.includes(':lock:') || k.endsWith(':scopes')) continue;
        const raw = await redis.get(k);
        if (!raw) continue;
        try {
          const v = JSON.parse(raw) as { computedAt?: string };
          if (!v.computedAt) continue;
          v.computedAt = old;
          await redis.set(k, JSON.stringify(v), 'KEEPTTL');
        } catch {
          /* not a board */
        }
      }
      // Let the previous open's background refreshes finish first.
      await new Promise((r) => setTimeout(r, 1500));
    };

    it('prints per-page and per-endpoint latency inside the burst', async () => {
      const admin = await adminSession(base, prisma, 'super_admin');
      const per = new Map<string, number[]>();
      const status = new Map<string, number>();
      const pageRows: string[] = [
        '| page | requests | first open ms | p50 ms | p95 ms | SQL per open |',
        '|---|---|---|---|---|---|',
      ];
      const timed = async (path: string) => {
        const t0 = process.hrtime.bigint();
        const res = await request(base).get(`/api/v1${path}`).set(admin.auth);
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        status.set(path, res.status);
        return ms;
      };
      for (const [page, paths] of Object.entries(ADMIN_PAGES)) {
        const all = [...SHELL, ...paths.filter((p) => !SHELL.includes(p))];
        const walls: number[] = [];
        // Statements the database ran per open (pg_stat_statements when the
        // extension exists; the probe itself is one of them).
        const sqlCalls = async (): Promise<number | null> => {
          try {
            const r = await prisma.$queryRawUnsafe<{ n: number }[]>(
              'SELECT sum(calls)::float8 AS n FROM pg_stat_statements',
            );
            return Number(r[0]?.n ?? 0);
          } catch {
            return null;
          }
        };
        const sqls: number[] = [];
        for (let i = 0; i < PAGE_ROUNDS; i++) {
          await ageBoards();
          const before = await sqlCalls();
          const t0 = process.hrtime.bigint();
          const ms = await Promise.all(all.map(timed));
          walls.push(Number(process.hrtime.bigint() - t0) / 1e6);
          const after = await sqlCalls();
          if (i > 0 && before !== null && after !== null)
            sqls.push(after - before - 1);
          all.forEach((p, k) => {
            if (i === 0) return; // the first open is the cold one
            const xs = per.get(p) ?? [];
            xs.push(ms[k]);
            per.set(p, xs);
          });
        }
        const warm = walls.slice(1);
        pageRows.push(
          `| ${page} | ${all.length} | ${walls[0].toFixed(0)} | ${pct(warm, 0.5).toFixed(0)} | ${pct(warm, 0.95).toFixed(0)} | ${sqls.length ? pct(sqls, 0.5).toFixed(0) : 'n/a'} |`,
        );
      }
      const epRows = [
        '| endpoint | status | p50 ms | p95 ms | max ms |',
        '|---|---|---|---|---|',
        ...[...per.entries()]
          .sort((a, b) => pct(b[1], 0.95) - pct(a[1], 0.95))
          .map(
            ([p, xs]) =>
              `| \`${p}\` | ${status.get(p)} | ${pct(xs, 0.5).toFixed(0)} | ${pct(xs, 0.95).toFixed(0)} | ${Math.max(...xs).toFixed(0)} |`,
          ),
      ];
      console.log(
        `\nDB_POOL_SIZE=${process.env.DB_POOL_SIZE ?? '(default)'} stale=${process.env.PERF_STALE === '1'}\n${pageRows.join('\n')}\n\n${epRows.join('\n')}\n`,
      );
      // Budget (owner 2026-11-08): every admin endpoint answers within
      // 300 ms at p95 while its whole page loads at once on 3 connections.
      const budget = Number(process.env.PERF_BUDGET_MS ?? 300);
      const over = [...per.entries()]
        .filter(([, xs]) => pct(xs, 0.95) > budget)
        .map(([p, xs]) => `${p} p95 ${pct(xs, 0.95).toFixed(0)} ms`);
      expect(over).toEqual([]);
    });
  },
);

(RUN && process.env.PERF_PAGES !== '1' ? describe : describe.skip)(
  'Admin endpoints on a big database',
  () => {
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
  },
);
