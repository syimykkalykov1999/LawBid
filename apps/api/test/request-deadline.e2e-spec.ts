import { randomUUID } from 'node:crypto';
import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { PinoLogger } from 'nestjs-pino';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { RequestDeadlineMiddleware } from '../src/common/resilience/request-deadline.middleware';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Stage 2 SRE (Б5) on real PostgreSQL: the app says it waits 300 ms
 * (`X-Request-Timeout-Ms`), the read behind it would take 5 s. The answer is
 * 504 DEADLINE_EXCEEDED right after the 300 ms, and Postgres itself
 * cancelled the statement (`SET LOCAL statement_timeout` of the
 * transaction), so nothing of it is left running in `pg_stat_activity`.
 * Without the header the same route keeps today's behaviour.
 */
const marker = `deadline_e2e_${randomUUID().replace(/-/g, '')}`;
const prisma = new PrismaService();

@Controller('slow')
class SlowController {
  @Get()
  async slow(): Promise<{ ok: true }> {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(`SELECT pg_sleep(5)::text AS s /* ${marker} */`);
    });
    return { ok: true };
  }

  @Get('quick')
  async quick(): Promise<{ ok: true }> {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        `SELECT pg_sleep(0.05)::text AS s /* ${marker}_q */`,
      );
    });
    return { ok: true };
  }
}

@Module({ controllers: [SlowController] })
class SlowModule {}

describe('request deadline (real PostgreSQL)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await prisma.onModuleInit();
    const moduleRef = await Test.createTestingModule({
      imports: [SlowModule],
      providers: [
        {
          provide: APP_FILTER,
          useFactory: () =>
            new AllExceptionsFilter({
              setContext: () => undefined,
              error: () => undefined,
              warn: () => undefined,
            } as unknown as PinoLogger),
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    const mw = new RequestDeadlineMiddleware();
    app.use(mw.use.bind(mw));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it('300 ms deadline + a 5 s read → 504 at once, the query is cancelled in the database', async () => {
    const started = Date.now();
    const res = await request(app.getHttpServer())
      .get('/slow')
      .set('X-Request-Timeout-Ms', '300');
    const took = Date.now() - started;
    expect(res.status).toBe(504);
    expect(res.body).toMatchObject({ error: { code: 'DEADLINE_EXCEEDED' } });
    expect(took).toBeLessThan(3000);
    const left = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE query LIKE '%${marker} */%' AND query NOT LIKE '%pg_stat_activity%'`,
    );
    expect(left[0].n).toBe(0);
  });

  it('a read that fits the deadline answers normally', async () => {
    const res = await request(app.getHttpServer())
      .get('/slow/quick')
      .set('X-Request-Timeout-Ms', '5000');
    expect(res.status).toBe(200);
  });
});
