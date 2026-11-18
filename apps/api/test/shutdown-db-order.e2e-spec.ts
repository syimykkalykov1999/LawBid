import { Socket } from 'node:net';
import { Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JournalRetentionService } from '../src/modules/privacy/journal-retention.service';
import { PrivacyRetentionService } from '../src/modules/privacy/privacy-retention.service';
import { DataRetentionService } from '../src/modules/storage/data-retention.service';
import { StorageCoreModule } from '../src/modules/storage/storage.module';

/**
 * Row 213 / KNOWN_ERRORS 179: «API e2e» went red at random with «Test
 * suite failed to run: Cannot read properties of undefined (reading
 * 'Socket')» (pg/lib/stream.js ← pg-pool _pulseQueue) AFTER a suite had
 * passed.
 *
 * Cause: Nest 12 closes in the order onModuleDestroy → beforeApplication
 * Shutdown → dispose (HTTP server) → onApplicationShutdown, each phase from
 * the root module outwards with @Global modules (distance MAX) last. Prisma
 * disconnected in onModuleDestroy, i.e. FIRST of all; every BullMQ runner
 * (JobsRunner and the ~20 others) closes its workers in
 * onApplicationShutdown, and `worker.close()` waits for the running job.
 * A job that queried in that window re-opened Prisma's node-pg pool
 * (Prisma connects lazily), and nobody closed it again: app.close()
 * resolved with a live pool, Jest tore the file's module registry down,
 * and the next pool activity hit `require('net')` → undefined.
 *
 * Fix (copied from @nestjs/typeorm's TypeOrmCoreModule and
 * @nestjs/mongoose: the @Global DB module closes its connection in
 * onApplicationShutdown, which runs after every non-global module's
 * hooks): PrismaService disconnects in onApplicationShutdown.
 */
@Injectable()
class InFlightJob implements OnApplicationShutdown {
  result: unknown;
  constructor(private readonly prisma: PrismaService) {}
  // Same place and shape as JobsRunner.onApplicationShutdown: closeWorker()
  // waits here for a cron job that is still talking to the database.
  async onApplicationShutdown(): Promise<void> {
    this.result = await this.prisma.$queryRaw`SELECT 1 AS one`;
  }
}
@Module({ providers: [InFlightJob] })
class JobsLikeModule {}

type RetentionClient = { $queryRaw: PrismaService['$queryRaw'] };
/** The cron job's view of the retention services: their own client. */
@Injectable()
class InFlightRetentionJob implements OnApplicationShutdown {
  result: unknown;
  constructor(
    private readonly journal: JournalRetentionService,
    private readonly privacy: PrivacyRetentionService,
    private readonly data: DataRetentionService,
  ) {}
  async query(): Promise<number[]> {
    const clients = [
      (this.journal as unknown as { client(): RetentionClient }).client(),
      (this.privacy as unknown as { retention(): RetentionClient }).retention(),
      (this.data as unknown as { retention(): RetentionClient }).retention(),
    ];
    const out: number[] = [];
    for (const c of clients) {
      const rows = await c.$queryRaw<{ one: number }[]>`SELECT 1 AS one`;
      out.push(rows[0].one);
    }
    return out;
  }
  // Same place as JobsRunner.onApplicationShutdown (cron.processor runs
  // storage.retention / privacy.retention / journal retention).
  async onApplicationShutdown(): Promise<void> {
    this.result = await this.query();
  }
}
// Like JobsModule: imports StorageCoreModule, gets the privacy services
// from the @Global PrivacyModule.
@Module({
  imports: [StorageCoreModule],
  providers: [InFlightRetentionJob],
})
class RetentionJobsLikeModule {}

/** Every socket node-pg opens to the test database (pg/lib/stream.js
 * `new net.Socket()` then `connect(port, host)`); the spy calls through. */
const dbPort = Number(new URL(process.env.DATABASE_URL ?? '').port || 5432);
let connectSpy: jest.SpyInstance | undefined;
function openDbSockets(): number {
  if (!connectSpy) return 0;
  const { calls, contexts } = connectSpy.mock as {
    calls: unknown[][];
    contexts: Socket[];
  };
  return calls.filter((args, i) => {
    const first = args[0] as { port?: unknown } | number | string;
    const port =
      typeof first === 'object' && first !== null ? first.port : first;
    return Number(port) === dbPort && !contexts[i].destroyed;
  }).length;
}

jest.setTimeout(120_000);

describe('shutdown order: workers before the database (row 213)', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    connectSpy = jest.spyOn(Socket.prototype, 'connect');
  });
  afterAll(() => {
    connectSpy?.mockRestore();
  });

  it('a job finishing during app.close() leaves no open database socket', async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule, JobsLikeModule],
    }).compile();
    const app = mod.createNestApplication();
    await app.init();
    const job = app.get(InFlightJob);
    expect(openDbSockets()).toBeGreaterThan(0);
    await app.close();
    // node-pg's `end` destroys the sockets on the next turns.
    await new Promise((r) => setTimeout(r, 500));

    expect(job.result).toEqual([{ one: 1 }]);
    // Before the fix: the pool the job re-opened after Prisma's
    // $disconnect is still connected here, after app.close() resolved.
    expect(openDbSockets()).toBe(0);
  });

  // The three retention services own a second client (RETENTION_DATABASE_URL,
  // the `lawbid_retention` role). They closed it in onModuleDestroy, before
  // JobsRunner drains the cron job that uses it, so the same re-open leak
  // stayed for them. Now they close it in onApplicationShutdown, after the
  // workers (PrivacyModule is @Global; JobsModule imports StorageCoreModule).
  it('a retention job finishing during app.close() leaves no open socket on the retention client', async () => {
    const saved = process.env.RETENTION_DATABASE_URL;
    process.env.RETENTION_DATABASE_URL = process.env.DATABASE_URL;
    try {
      const mod = await Test.createTestingModule({
        imports: [AppModule, RetentionJobsLikeModule],
      }).compile();
      const app = mod.createNestApplication();
      await app.init();
      const job = app.get(InFlightRetentionJob);
      // Each client is open (a cron run used it earlier).
      expect(await job.query()).toEqual([1, 1, 1]);
      const before = openDbSockets();
      expect(before).toBeGreaterThan(0);
      await app.close();
      await new Promise((r) => setTimeout(r, 500));

      expect(job.result).toEqual([1, 1, 1]);
      // Before the fix: the three pools the job re-opened after their
      // onModuleDestroy $disconnect are still connected here.
      expect(openDbSockets()).toBe(0);
    } finally {
      if (saved === undefined) delete process.env.RETENTION_DATABASE_URL;
      else process.env.RETENTION_DATABASE_URL = saved;
    }
  });
});
