import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import type Redis from 'ioredis';

/**
 * Search latency on a big database (owner 2026-10-15: "must not hang with
 * millions of users"). Only runs with PERF_SEARCH=1 against a database that
 * was filled with docs/runbooks/search-load-test.md's generator; prints a
 * table of p50 / p95 / max per endpoint and query kind (cold = first call,
 * Redis cache empty; warm = the repeat).
 */
const RUN = process.env.PERF_SEARCH === '1';
jest.setTimeout(30 * 60_000);

(RUN ? describe : describe.skip)('Search latency on a big database', () => {
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

  const pct = (xs: number[], p: number) =>
    [...xs].sort((a, b) => a - b)[
      Math.min(xs.length - 1, Math.floor(xs.length * p))
    ];

  it('prints the latency table', async () => {
    // An attorney licensed in five states with five practices.
    // The per-user search budget would throttle the measurement itself.
    await prisma.appConfig.upsert({
      where: { key: 'rate_limit.search_per_minute' },
      create: { key: 'rate_limit.search_per_minute', value: 100000 },
      update: { value: 100000 },
    });
    await app.get<Redis>(REDIS_CLIENT).del('config:app_config');
    const att = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Perf', last_name: 'Tester' },
    });
    await prisma.attorneyProfile.create({
      data: {
        user_id: att.id,
        username: `perf${att.id.slice(0, 8)}`,
        username_lower: `perf${att.id.slice(0, 8)}`,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    const states = await prisma.state.findMany({
      take: 5,
      orderBy: { code: 'asc' },
    });
    for (const s of states) {
      await prisma.attorneyLicense.create({
        data: {
          attorney_id: att.id,
          state_code: s.code,
          bar_number: `P${randomUUID().slice(0, 10)}`,
          license_status: 'verified',
        },
      });
    }
    const areas = await prisma.practiceArea.findMany({ take: 40 });
    for (const a of areas.slice(0, 20)) {
      await prisma.attorneyPracticeArea.create({
        data: { attorney_id: att.id, practice_area_id: a.id },
      });
    }
    const viewer = await prisma.user.create({ data: { role: 'client' } });
    const as = (id: string, role: 'attorney' | 'client') => ({
      Authorization: `Bearer ${tokens.signAccessToken({
        sub: id,
        role,
        sid: randomUUID(),
        verified: role === 'attorney',
        subscriptionStatus: 'none',
      })}`,
    });
    const attAuth = as(att.id, 'attorney');
    const viewAuth = as(viewer.id, 'client');

    // Query kinds: a common word, a rare word, two words, a prefix, a typo.
    const kinds: [string, string][] = [
      ['common', 'immigration'],
      ['rare', 'term19999'],
      ['two words', 'green card'],
      ['prefix', 'immigr'],
      ['typo', 'imigration vsa'],
      ['handle', 'law4'],
      ['name', 'sofia hernandez'],
    ];
    const endpoints: [string, string, Record<string, string>][] = [
      ['posts', '/api/v1/search/posts', {}],
      ['cases', '/api/v1/search/cases', {}],
      ['people', '/api/v1/search/people', {}],
      ['people+state', '/api/v1/search/people', { state: 'CA' }],
      ['suggest', '/api/v1/search/suggest', {}],
    ];
    const rows: string[] = [];
    for (const [ep, url, extra] of endpoints) {
      for (const [kind, q] of kinds) {
        const auth = ep === 'cases' ? attAuth : viewAuth;
        const cold: number[] = [];
        const warm: number[] = [];
        // Different cache keys each time for "cold": add a harmless filter
        // variation by appending a rare suffix is not possible, so use the
        // first call as cold and the next five as warm.
        for (let i = 0; i < 6; i++) {
          const t0 = process.hrtime.bigint();
          const r = await request(base)
            .get(url)
            .query({ q, ...extra })
            .set(auth);
          const ms = Number(process.hrtime.bigint() - t0) / 1e6;
          if (r.status !== 200) {
            throw new Error(
              `${ep} ${kind} -> ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`,
            );
          }
          (i === 0 ? cold : warm).push(ms);
        }
        rows.push(
          `${ep.padEnd(13)} ${kind.padEnd(10)} cold ${cold[0].toFixed(0).padStart(5)} ms   warm p50 ${pct(warm, 0.5).toFixed(0).padStart(4)} ms  p95 ${pct(warm, 0.95).toFixed(0).padStart(4)} ms`,
        );
      }
    }
    console.log(`\n${rows.join('\n')}\n`);
  });
});
