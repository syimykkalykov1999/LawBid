import type { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { QueueEvents, type Job } from 'bullmq';
import Redis from 'ioredis';
import { randomBytes, randomUUID } from 'node:crypto';
import { WorkerModule } from '../src/jobs/worker.module';
import { JobsRunner } from '../src/jobs/jobs.runner';
import {
  CRON_JOBS,
  CRON_QUEUE,
  CRON_SCHEDULES,
  DISPOSABLE_DOMAINS_FETCHER,
} from '../src/jobs/jobs.constants';
import { DISPOSABLE_MIN_DOMAINS } from '../src/jobs/disposable-domains/disposable-domains-refresh.job';

/**
 * BullMQ `cron` queue end to end (real Redis + CockroachDB): schedules
 * exist once no matter how many instances boot, and each job — run
 * through the real queue and worker — does its docs/02 §6.4 / §3.3 work.
 * The disposable-domain fetcher is a fake (no network).
 */
describe('Background jobs (e2e) — BullMQ cron queue', () => {
  // App boot + CockroachDB fixtures exceed Jest's 5 s default under load.
  jest.setTimeout(60_000);

  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL as string);
  const fetcher = {
    body: '' as string | Error,
    calls: 0,
    fetch(): Promise<string> {
      this.calls += 1;
      return this.body instanceof Error
        ? Promise.reject(this.body)
        : Promise.resolve(this.body);
    },
  };
  const apps: INestApplicationContext[] = [];
  let runner: JobsRunner;
  let events: QueueEvents;

  async function boot(): Promise<INestApplicationContext> {
    const moduleRef = await Test.createTestingModule({
      imports: [WorkerModule],
    })
      .overrideProvider(DISPOSABLE_DOMAINS_FETCHER)
      .useValue(fetcher)
      .compile();
    await moduleRef.init();
    apps.push(moduleRef);
    return moduleRef;
  }

  async function runJob(name: (typeof CRON_JOBS)[keyof typeof CRON_JOBS]) {
    const job: Job = await runner.runNow(name);
    return (await job.waitUntilFinished(events, 60_000)) as unknown;
  }

  beforeAll(async () => {
    // Two instances (e.g. two API tasks): both schedule, both run workers.
    const first = await boot();
    await boot();
    runner = first.get(JobsRunner);
    events = new QueueEvents(CRON_QUEUE, {
      connection: { url: process.env.REDIS_URL, maxRetriesPerRequest: null },
    });
    await events.waitUntilReady();
  });

  afterAll(async () => {
    await events.close();
    for (const app of apps) await app.close();
    await redis.quit();
    await prisma.$disconnect();
  });

  it('registers each repeatable job exactly once across instances', async () => {
    const queue = runner.cronQueue!;
    const schedulers = await queue.getJobSchedulers();
    expect(schedulers.map((s) => s.key).sort()).toEqual(
      CRON_SCHEDULES.map((s) => s.name).sort(),
    );
    for (const s of schedulers) {
      const want = CRON_SCHEDULES.find((c) => c.name === s.key)!;
      expect(s.pattern).toBe(want.pattern);
      expect(s.tz).toBe('UTC');
    }
    // One pending (delayed) run per scheduler, not one per instance.
    expect(await queue.getDelayedCount()).toBe(CRON_SCHEDULES.length);

    // A third boot (rolling deploy) is still idempotent.
    await boot();
    expect((await queue.getJobSchedulers()).length).toBe(CRON_SCHEDULES.length);
    expect(await queue.getDelayedCount()).toBe(CRON_SCHEDULES.length);
  });

  it('sessions.cleanup removes expired and long-revoked sessions, keeps live and rotated ones', async () => {
    const user = await prisma.user.create({ data: {} });
    const day = 86_400_000;
    const now = Date.now();
    const mk = (
      label: string,
      expiresIn: number,
      revoked?: { ago: number; reason: string },
    ) =>
      prisma.session.create({
        data: {
          user_id: user.id,
          session_chain_id: randomUUID(),
          device_id: label,
          refresh_hash: randomBytes(24).toString('hex'),
          expires_at: new Date(now + expiresIn),
          revoked_at: revoked ? new Date(now - revoked.ago) : null,
          revoked_reason: revoked?.reason ?? null,
        },
      });
    const active = await mk('active', 30 * day);
    const expired = await mk('expired', -day);
    const expiredRevoked = await mk('expired-revoked', -day, {
      ago: 2 * day,
      reason: 'logout',
    });
    const oldLogout = await mk('old-logout', 20 * day, {
      ago: 40 * day,
      reason: 'logout',
    });
    const recentLogout = await mk('recent-logout', 20 * day, {
      ago: day,
      reason: 'logout',
    });
    // Needed for reuse detection until it expires, however old.
    const oldRotated = await mk('old-rotated', 20 * day, {
      ago: 40 * day,
      reason: 'rotated',
    });
    // FK ON DELETE CASCADE: the expired session's push token goes too.
    await prisma.pushToken.create({
      data: {
        user_id: user.id,
        session_id: expired.id,
        fcm_token: `fcm-${randomUUID()}`,
        platform: 'ios',
      },
    });

    const result = (await runJob(CRON_JOBS.sessionsCleanup)) as {
      deleted: number;
      scanned: number;
    };

    const left = await prisma.session.findMany({
      where: { user_id: user.id },
      select: { id: true },
    });
    expect(new Set(left.map((s) => s.id))).toEqual(
      new Set([active.id, recentLogout.id, oldRotated.id]),
    );
    expect(left.map((s) => s.id)).not.toContain(expiredRevoked.id);
    expect(left.map((s) => s.id)).not.toContain(oldLogout.id);
    expect(result.deleted).toBeGreaterThanOrEqual(3);
    expect(result.scanned).toBeGreaterThanOrEqual(6);
    expect(await prisma.pushToken.count({ where: { user_id: user.id } })).toBe(
      0,
    );

    // Idempotent: a second run finds nothing more of this user's.
    await runJob(CRON_JOBS.sessionsCleanup);
    expect(await prisma.session.count({ where: { user_id: user.id } })).toBe(3);
  });

  it('otp.cleanup deletes OTP / rate-limit keys without TTL, leaves TTL-bound and foreign keys', async () => {
    await redis.set('otp:att:leaked', '4');
    await redis.set('otp:code:live', 'hash', 'EX', 600);
    await redis.set('otp:lock:live', '1', 'EX', 900);
    await redis.zadd('rl:sliding:leaked', Date.now(), 'x');
    await redis.set('idem:not-ours', '1');

    const result = (await runJob(CRON_JOBS.otpCleanup)) as { deleted: number };

    expect(result.deleted).toBe(2);
    expect(await redis.exists('otp:att:leaked')).toBe(0);
    expect(await redis.exists('rl:sliding:leaked')).toBe(0);
    expect(await redis.get('otp:code:live')).toBe('hash');
    expect(await redis.pttl('otp:lock:live')).toBeGreaterThan(0);
    expect(await redis.get('idem:not-ours')).toBe('1');
  });

  describe('disposable-domains.refresh', () => {
    const list = (n: number) =>
      Array.from({ length: n }, (_, i) => `throwaway${i}.example`);

    beforeAll(async () => {
      await prisma.blockedEmailDomain.createMany({
        data: [
          { domain: 'privaterelay.appleid.com', reason: 'apple_relay' },
          { domain: 'stale-disposable.example', reason: 'disposable' },
          { domain: 'throwaway0.example', reason: 'disposable' },
        ],
        skipDuplicates: true,
      });
    });

    it('applies the fetched list: adds new, removes stale disposable rows, keeps apple_relay', async () => {
      const domains = list(DISPOSABLE_MIN_DOMAINS + 20);
      fetcher.body = [
        '# header comment',
        ...domains,
        'privaterelay.appleid.com',
      ].join('\n');
      fetcher.calls = 0;

      const result = await runJob(CRON_JOBS.disposableDomainsRefresh);

      expect(result).toEqual({
        status: 'updated',
        added: domains.length - 1,
        removed: 1,
        total: domains.length,
      });
      // Two workers are running; the job was still processed once.
      expect(fetcher.calls).toBe(1);
      expect(
        await prisma.blockedEmailDomain.findUnique({
          where: { domain: 'privaterelay.appleid.com' },
        }),
      ).toEqual({ domain: 'privaterelay.appleid.com', reason: 'apple_relay' });
      expect(
        await prisma.blockedEmailDomain.count({
          where: { reason: 'disposable' },
        }),
      ).toBe(domains.length);
      expect(
        await prisma.blockedEmailDomain.findUnique({
          where: { domain: 'stale-disposable.example' },
        }),
      ).toBeNull();
    });

    it.each([
      ['fetch_failed', new Error('getaddrinfo ENOTFOUND')],
      ['too_few_domains', 'only.example\ntwo.example'],
      ['too_many_invalid_lines', '<html><body>404</body></html>\n'.repeat(50)],
    ])(
      'fail-safe (%s): keeps the current table untouched',
      async (reason, body) => {
        const before = await prisma.blockedEmailDomain.findMany({
          orderBy: { domain: 'asc' },
        });
        fetcher.body = body;

        await expect(
          runJob(CRON_JOBS.disposableDomainsRefresh),
        ).resolves.toEqual({ status: 'skipped', reason });

        expect(
          await prisma.blockedEmailDomain.findMany({
            orderBy: { domain: 'asc' },
          }),
        ).toEqual(before);
      },
    );
  });
});
