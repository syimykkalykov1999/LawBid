/* eslint-disable @typescript-eslint/unbound-method */
import type { VerificationLossBillingJob } from './handlers/verification-loss-billing.job';
import type { PostVideosService } from '../modules/posts/post-videos.service';
import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { Queue, Worker } from 'bullmq';
import { JobsRunner, CRON_JOB_TEMPLATE_OPTS, cronJobOpts } from './jobs.runner';
import { CronProcessor } from './cron.processor';
import type {
  TaskArchivePurgeJob,
  TaskRemindersJob,
} from './handlers/tasks-planner.jobs';
import {
  CRON_FAST_QUEUE,
  CRON_LANES,
  CRON_HEAVY_QUEUE,
  CRON_JOBS,
  CRON_QUEUE,
  CRON_SCHEDULES,
  cronLaneOf,
  isSubHourly,
} from './jobs.constants';
import type { SessionsCleanupJob } from './handlers/sessions-cleanup.job';
import type { OtpCleanupJob } from './handlers/otp-cleanup.job';
import type { CallsService } from '../modules/calls/calls.service';
import type { ClientReviewsService } from '../modules/client-reviews/client-reviews.service';
import type { DisposableDomainsRefreshJob } from './disposable-domains/disposable-domains-refresh.job';
import type { ReviewReminderJob } from './handlers/review-reminder.job';
import type { RatingReconcileJob } from './handlers/rating-reconcile.job';
import type { LicenseExpiryJob } from './handlers/license-expiry.job';
import type { LicenseRegistryRecheckJob } from './handlers/license-registry-recheck.job';
import type { BidSubscriptionLapseJob } from './handlers/bid-subscription-lapse.job';
import {
  CaseStalePauseJob,
  CaseAutoCloseJob,
  CaseCompletionReminderJob,
  CaseStaleAskJob,
} from './handlers/case-lifecycle.jobs';
import type { CaseDeadlineReminderJob } from './handlers/case-deadline-reminder.job';
import { CountersReconcileJob } from './handlers/counters-reconcile.job';
import { FeedRecoJob } from '../modules/feed/feed-reco.job';
import { TrendingTagsJob } from '../modules/search/trending-tags.job';
import { NotificationsRetentionJob } from './handlers/notifications-retention.job';
import { OpsMetricsJob } from './handlers/ops-metrics.job';
import { AccountAnonymizationService } from '../modules/privacy/account-anonymization.service';
import { ExportsCleanupService } from '../modules/privacy/exports-cleanup.service';
import { JournalIntegrityService } from '../modules/privacy/journal-integrity.service';
import { JournalRetentionService } from '../modules/privacy/journal-retention.service';
import type { CasePaymentsService } from '../modules/case-payments/case-payments.service';
import type { PromotionsService } from '../modules/promotions/promotions.service';
import type { StarsService } from '../modules/stars/stars.service';
import type { PartnersService } from '../modules/partners/partners.service';
import type { AttorneyTrustService } from '../modules/attorney-trust/attorney-trust.service';
import type { ClientFraudService } from '../modules/client-fraud/client-fraud.service';

// bullOptions would open a real shared Redis producer; keep the unit test
// socket-free and assert on the plain option objects instead.
jest.mock('../redis/redis-connection', () => ({
  ...jest.requireActual<typeof import('../redis/redis-connection')>(
    '../redis/redis-connection',
  ),
  bullOptions: (_q: string, url: string, o?: { worker?: boolean }) => ({
    connection: o?.worker ? { url, maxRetriesPerRequest: null } : { url },
  }),
}));

jest.mock('bullmq', () => {
  const queue = {
    upsertJobScheduler: jest.fn(() => Promise.resolve({})),
    getJobSchedulers: jest.fn(() =>
      Promise.resolve([
        { key: 'sessions.cleanup' },
        { key: 'legacy.job.removed-in-this-release' },
      ]),
    ),
    removeJobScheduler: jest.fn(() => Promise.resolve(true)),
    add: jest.fn(() => Promise.resolve({ id: '1' })),
    close: jest.fn(() => Promise.resolve()),
  };
  const worker = { on: jest.fn(), close: jest.fn(() => Promise.resolve()) };
  return {
    Queue: jest.fn(() => queue),
    Worker: jest.fn(() => worker),
    __queue: queue,
    __worker: worker,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mocked = require('bullmq') as {
  __queue: Record<string, jest.Mock>;
  __worker: Record<string, jest.Mock>;
};

const logger = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as PinoLogger;

function config(env: Record<string, unknown>): ConfigService {
  return {
    get: (k: string) => env[k],
    getOrThrow: (k: string) => env[k],
  } as unknown as ConfigService;
}

function processor() {
  const sessions = { run: jest.fn(() => Promise.resolve({ deleted: 1 })) };
  const otp = { run: jest.fn(() => Promise.resolve({ deleted: 2 })) };
  const disposable = {
    run: jest.fn(() => Promise.resolve({ status: 'updated' })),
  };
  const reminder = { run: jest.fn(() => Promise.resolve({ sent: 3 })) };
  const reconcile = {
    run: jest.fn(() => Promise.resolve({ scanned: 4, fixed: 1 })),
  };
  const licenses = { run: jest.fn(() => Promise.resolve({ expired: 3 })) };
  const registryRecheck = {
    run: jest.fn(() => Promise.resolve({ checked: 2, queued: 0 })),
  };
  const bidLapse = {
    run: jest.fn(() =>
      Promise.resolve({ attorneysChecked: 5, bidsWithdrawn: 1 }),
    ),
  };
  const caseJob = () => ({
    run: jest.fn(() => Promise.resolve({ processed: 1, ran: true })),
  });
  const countersRecon = {
    run: jest.fn(() => Promise.resolve({ flushed: 1, reconciled: 2 })),
  };
  const stale = caseJob();
  const archive = caseJob();
  const autoClose = caseJob();
  const completion = caseJob();
  const deadline = caseJob();
  return {
    countersRecon,
    stale,
    archive,
    autoClose,
    completion,
    sessions,
    otp,
    disposable,
    reminder,
    reconcile,
    licenses,
    bidLapse,
    processor: new CronProcessor(
      sessions as unknown as SessionsCleanupJob,
      otp as unknown as OtpCleanupJob,
      disposable as unknown as DisposableDomainsRefreshJob,
      reminder as unknown as ReviewReminderJob,
      reconcile as unknown as RatingReconcileJob,
      licenses as unknown as LicenseExpiryJob,
      registryRecheck as unknown as LicenseRegistryRecheckJob,
      bidLapse as unknown as BidSubscriptionLapseJob,
      { run: jest.fn() } as unknown as VerificationLossBillingJob,
      stale as unknown as CaseStaleAskJob,
      archive as unknown as CaseStalePauseJob,
      autoClose as unknown as CaseAutoCloseJob,
      completion as unknown as CaseCompletionReminderJob,
      countersRecon as unknown as CountersReconcileJob,
      { run: jest.fn() } as unknown as FeedRecoJob,
      { run: jest.fn() } as unknown as TrendingTagsJob,
      { run: jest.fn() } as unknown as NotificationsRetentionJob,
      { anonymizeDue: jest.fn() } as unknown as AccountAnonymizationService,
      { run: jest.fn() } as unknown as JournalRetentionService,
      { run: jest.fn() } as unknown as JournalIntegrityService,
      { run: jest.fn() } as unknown as ExportsCleanupService,
      {
        queueDepths: jest.fn(),
        businessCounters: jest.fn(),
      } as unknown as OpsMetricsJob,
      { sweep: jest.fn(() => Promise.resolve(0)) } as unknown as CallsService,
      {
        sweepAppeals: jest.fn(() => Promise.resolve(0)),
      } as unknown as ClientReviewsService,
      {
        sweep: jest.fn(() => Promise.resolve({})),
      } as unknown as PostVideosService,
      {
        expire: jest.fn(() => Promise.resolve({ finished: 0, abandoned: 0 })),
      } as unknown as PromotionsService,
      { sweepPending: jest.fn() } as unknown as StarsService,
      { run: jest.fn() } as unknown as TaskRemindersJob,
      { run: jest.fn() } as unknown as TaskArchivePurgeJob,
      {
        expire: jest.fn(() => Promise.resolve({ abandoned: 0 })),
      } as unknown as CasePaymentsService,
      {
        sweep: jest.fn(() =>
          Promise.resolve({ approved: 0, reversed: 0, monthlyBase: 0 }),
        ),
      } as unknown as PartnersService,
      undefined,
      deadline as unknown as CaseDeadlineReminderJob,
      {
        recomputeAll: jest.fn(() =>
          Promise.resolve({ attorneys: 0, changed: 0 }),
        ),
      } as unknown as AttorneyTrustService,
      {
        sweep: jest.fn(() =>
          Promise.resolve({ rescored: 0, propagated: 0, purged: 0 }),
        ),
      } as unknown as ClientFraudService,
    ),
  };
}

describe('JobsRunner', () => {
  beforeEach(() => jest.clearAllMocks());

  it('schedules every cron job under a fixed id (daily cleanups, monthly refresh, UTC)', async () => {
    const runner = new JobsRunner(
      { mode: 'api' },
      config({ REDIS_URL: 'redis://localhost:6379/3' }),
      processor().processor,
      logger,
    );
    await runner.onApplicationBootstrap();
    // API mode starts in the background; boot itself never waits on Redis.
    await runner.whenStarted();

    expect(Queue).toHaveBeenCalledWith(CRON_QUEUE, {
      connection: { url: 'redis://localhost:6379/3' },
    });
    const upserts = mocked.__queue.upsertJobScheduler.mock.calls;
    expect(upserts).toHaveLength(CRON_SCHEDULES.length);
    // OQ-041: + calls.sweep every minute; owner 2026-09-30: + the hourly
    // review-appeal sweep; owner 2026-10-01: + videos.sweep (every minute);
    // owner 2026-10-02: + promotions.expire every 5 min; owner 2026-10-04:
    // + monthly licenses.registry-recheck; owner 2026-10-05: + the
    // planner's reminders (every minute) and archive cleanup (daily),
    // + daily partners.sweep, case-payments.expire every 10 min and the
    // daily case-payments.remind.
    // Owner 2026-10-05: + nightly trust.recompute (anti-fraud).
    // Owner 2026-10-05: + daily cases.deadline-reminder,
    // + support.sweep every 5 min and the daily rewards.award.
    // Owner 2026-10-05 zero maintenance: + ops.guard every minute,
    // hourly ops.cost-check and ops.backup-check.
    // Owner 2026-10-05: + hourly demo.sweep (demo accounts past their TTL).
    // + nightly fraud.sweep (repeat accounts).
    // + hourly storage.gc, nightly storage.retention and storage.snapshot
    // (storage like Telegram), + daily outreach.retention (legal).
    // Owner 2026-10-05: + hourly cost.autoscale (spend caps follow usage).
    // + daily treasury.daily (profit and reserve).
    // Owner 2026-10-06: + daily country-partners.sweep.
    // Owner 2026-10-15: + nightly search.learn and search.tag-topics (5 min).
    // Owner 2026-10-16: + economy.guard (every 5 minutes).
    // Owner 2026-10-16: + billing.verification-loss (every 10 minutes).
    // Owner 2026-10-20: + stars.sweep (every 3 minutes) and the
    // consultations sweep (every minute).
    // Owner 2026-10-20: + legal.exports (every minute) and legal.retention
    // (nightly) for government-request archives.
    // Owner 2026-10-21: + chat.disappearing (every 2 minutes).
    // Owner 2026-10-21: + legal-qa.sweep (nightly).
    // Owner 2026-10-22: + contacts.joined (every 2 minutes).
    // Security research #5 (A7): + contacts.pepper-backfill (every 5 min).
    // Owner 2026-10-22 (SECURITY_TODO): + messages.reencrypt (every 5 min);
    // + ops.status-watchdog (every minute).
    // Owner 2026-10-23: + admin.summaries (every 2 minutes).
    // Batch C: + ops.usage-poll (daily).
    // Shard-ready step 7: + outbox.sweep (every minute).
    // Owner 2026-10-24: + search.index (every minute).
    // Owner 2026-10-27: + moderation.appeal-sla (hourly).
    // Day-one foundations: + ledger.reconcile (nightly).
    // DB-ops hardening: + db.health (daily).
    // S1-3: + chat.redeliver (every minute).
    // BUG-1 (package N-12b): + chat.search-backfill (every 5 minutes).
    // N-2: + events.maintain (every 5 minutes).
    // Experiments: + experiments.metrics (nightly).
    expect(upserts).toHaveLength(73);
    const byName = Object.fromEntries(
      upserts.map((c: unknown[]) => [c[0], c[1]]),
    );
    expect(byName[CRON_JOBS.opsGuard]).toEqual({
      pattern: '* * * * *',
      tz: 'UTC',
    });
    for (const name of [CRON_JOBS.opsCostCheck, CRON_JOBS.opsBackupCheck]) {
      expect(byName[name]).toEqual({
        pattern: expect.stringMatching(/^\d+ \* \* \* \*$/),
        tz: 'UTC',
      });
    }
    // Daily = fixed minute+hour, any day; monthly = fixed day-of-month.
    expect(byName[CRON_JOBS.sessionsCleanup]).toEqual({
      pattern: expect.stringMatching(/^\d+ \d+ \* \* \*$/),
      tz: 'UTC',
    });
    expect(byName[CRON_JOBS.otpCleanup]).toEqual({
      pattern: expect.stringMatching(/^\d+ \d+ \* \* \*$/),
      tz: 'UTC',
    });
    expect(byName[CRON_JOBS.disposableDomainsRefresh]).toEqual({
      pattern: expect.stringMatching(/^\d+ \d+ 1 \* \*$/),
      tz: 'UTC',
    });
    // docs/03 §7.3 / §7.5: daily reminder sweep, nightly reconciliation.
    for (const name of [CRON_JOBS.reviewReminder, CRON_JOBS.ratingReconcile]) {
      expect(byName[name]).toEqual({
        pattern: expect.stringMatching(/^\d+ \d+ \* \* \*$/),
        tz: 'UTC',
      });
    }
    expect(byName[CRON_JOBS.licenseExpiry]).toEqual({
      pattern: expect.stringMatching(/^\d+ \d+ \* \* \*$/),
      tz: 'UTC',
    });
    // docs/04 §2 (stage 4.4): hourly safety net.
    expect(byName[CRON_JOBS.bidSubscriptionLapse]).toEqual({
      pattern: expect.stringMatching(/^\d+ \* \* \* \*$/),
      tz: 'UTC',
    });
    for (const call of upserts) {
      const pattern = (call[1] as { pattern: string }).pattern;
      expect(call[2]).toEqual({ name: call[0], opts: cronJobOpts(pattern) });
    }
    // Stale scheduler from an older release is removed on every lane (the
    // shared mock answers the same list for each lane's queue).
    expect(mocked.__queue.removeJobScheduler).toHaveBeenCalledWith(
      'legacy.job.removed-in-this-release',
    );
    expect(
      mocked.__queue.removeJobScheduler.mock.calls.filter(
        ([k]) => k === 'legacy.job.removed-in-this-release',
      ),
    ).toHaveLength(3);
    // S10-2: one worker per lane; the signal lane runs three at a time.
    expect(Worker).toHaveBeenCalledTimes(3);
    expect(Worker).toHaveBeenCalledWith(
      CRON_FAST_QUEUE,
      expect.any(Function),
      expect.objectContaining({ concurrency: 3 }),
    );
    expect(Worker).toHaveBeenCalledWith(
      CRON_HEAVY_QUEUE,
      expect.any(Function),
      expect.objectContaining({ concurrency: 1, lockDuration: 300_000 }),
    );
    expect(Worker).toHaveBeenCalledWith(
      CRON_QUEUE,
      expect.any(Function),
      expect.objectContaining({
        concurrency: 1,
        connection: {
          url: 'redis://localhost:6379/3',
          maxRetriesPerRequest: null,
        },
      }),
    );

    await runner.onApplicationShutdown();
    expect(mocked.__worker.close).toHaveBeenCalled();
    expect(mocked.__queue.close).toHaveBeenCalled();
  });

  it('does nothing in the API process when JOBS_ENABLED=false', async () => {
    const runner = new JobsRunner(
      { mode: 'api' },
      config({ JOBS_ENABLED: false, REDIS_URL: 'redis://x' }),
      processor().processor,
      logger,
    );
    await runner.onApplicationBootstrap();
    expect(Queue).not.toHaveBeenCalled();
    expect(Worker).not.toHaveBeenCalled();
    await expect(runner.runNow(CRON_JOBS.otpCleanup)).rejects.toThrow(
      'disabled',
    );
    await runner.onApplicationShutdown();
  });

  it('a failing start never breaks API boot, but fails the worker boot', async () => {
    mocked.__queue.upsertJobScheduler.mockRejectedValueOnce(
      new Error('ECONNREFUSED'),
    );
    const api = new JobsRunner(
      { mode: 'api' },
      config({ REDIS_URL: 'redis://x' }),
      processor().processor,
      logger,
    );
    await expect(api.onApplicationBootstrap()).resolves.toBeUndefined();
    await expect(api.whenStarted()).rejects.toThrow('ECONNREFUSED');
    await api.onApplicationShutdown();

    mocked.__queue.upsertJobScheduler.mockRejectedValueOnce(
      new Error('ECONNREFUSED'),
    );
    const worker = new JobsRunner(
      { mode: 'worker' },
      config({ REDIS_URL: 'redis://x' }),
      processor().processor,
      logger,
    );
    await expect(worker.onApplicationBootstrap()).rejects.toThrow(
      'ECONNREFUSED',
    );
  });

  it('always runs in worker mode', async () => {
    const runner = new JobsRunner(
      { mode: 'worker' },
      config({ JOBS_ENABLED: false, REDIS_URL: 'redis://x' }),
      processor().processor,
      logger,
    );
    await runner.onApplicationBootstrap();
    expect(Worker).toHaveBeenCalledTimes(3);
    await runner.onApplicationShutdown();
  });

  it('puts the autoscaling/alarm signal on its own fast lane, away from the heavy jobs (S10-2)', () => {
    expect(cronLaneOf(CRON_JOBS.opsQueueMetrics)).toBe(CRON_FAST_QUEUE);
    expect(cronLaneOf(CRON_JOBS.callsSweep)).toBe(CRON_FAST_QUEUE);
    expect(cronLaneOf(CRON_JOBS.feedReco)).toBe(CRON_HEAVY_QUEUE);
    expect(cronLaneOf(CRON_JOBS.messagesReencrypt)).toBe(CRON_HEAVY_QUEUE);
    expect(cronLaneOf(CRON_JOBS.privacyAnonymize)).toBe(CRON_HEAVY_QUEUE);
    expect(cronLaneOf(CRON_JOBS.sessionsCleanup)).toBe(CRON_QUEUE);
    // every minute-job that is not a quick sweep must not sit with the signal
    const fast = CRON_SCHEDULES.filter(
      (s) => cronLaneOf(s.name) === CRON_FAST_QUEUE,
    );
    expect(fast.length).toBeGreaterThan(0);
    for (const s of fast) expect(isSubHourly(s.pattern)).toBe(true);
  });

  it('a sub-hourly schedule is its own retry; hourly and slower keep 3 attempts (S10-13)', () => {
    expect(isSubHourly('* * * * *')).toBe(true);
    expect(isSubHourly('*/10 * * * *')).toBe(true);
    expect(isSubHourly('3-58/5 * * * *')).toBe(true);
    expect(isSubHourly('20 * * * *')).toBe(false);
    expect(isSubHourly('15 3 * * *')).toBe(false);
    expect(cronJobOpts('* * * * *').attempts).toBe(1);
    expect(cronJobOpts('15 3 * * *')).toBe(CRON_JOB_TEMPLATE_OPTS);
  });

  describe('reconcileSchedules (S6-1: Redis lost the schedulers)', () => {
    async function started() {
      const runner = new JobsRunner(
        { mode: 'worker' },
        config({ REDIS_URL: 'redis://x' }),
        processor().processor,
        logger,
      );
      await runner.onApplicationBootstrap();
      jest.clearAllMocks();
      return runner;
    }

    it('re-registers every schedule when some are missing and logs the metric', async () => {
      const runner = await started();
      // the mock queue holds only sessions.cleanup + a legacy one
      const count = await runner.reconcileSchedules();
      expect(count).toBe(CRON_SCHEDULES.length);
      expect(mocked.__queue.upsertJobScheduler).toHaveBeenCalledTimes(
        CRON_SCHEDULES.length,
      );
      expect(logger.warn).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          metric: 'cron_schedulers',
          count: CRON_SCHEDULES.length,
          expected: CRON_SCHEDULES.length,
          missing: 0,
        }),
        'cron schedulers',
      );
      await runner.onApplicationShutdown();
    });

    it('does nothing (one cheap read) when all schedules are present', async () => {
      const runner = await started();
      // S10-2: one read per lane (the mock queue is shared by the lanes).
      for (let i = 0; i < CRON_LANES.length; i++) {
        mocked.__queue.getJobSchedulers.mockResolvedValueOnce(
          CRON_SCHEDULES.map((x) => ({ key: x.name })),
        );
      }
      expect(await runner.reconcileSchedules()).toBe(CRON_SCHEDULES.length);
      expect(mocked.__queue.upsertJobScheduler).not.toHaveBeenCalled();
      await runner.onApplicationShutdown();
    });

    it('never throws when Redis is down', async () => {
      const runner = await started();
      mocked.__queue.getJobSchedulers.mockRejectedValueOnce(new Error('down'));
      expect(await runner.reconcileSchedules()).toBe(-1);
      await runner.onApplicationShutdown();
    });
  });

  it('has one schedule per job name', () => {
    const names = CRON_SCHEDULES.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(names)).toEqual(new Set(Object.values(CRON_JOBS)));
  });
});

describe('CronProcessor lock (S10-13)', () => {
  function withRedis(held: boolean) {
    const redis = {
      set: jest.fn(() => Promise.resolve(held ? null : 'OK')),
      eval: jest.fn(() => Promise.resolve(1)),
    };
    const p = processor();
    const proc = p.processor;
    (proc as unknown as { redis: unknown }).redis = redis;
    return { redis, p, proc };
  }

  it('skips a tick whose previous run is still active, never queues behind it', async () => {
    const { proc, p, redis } = withRedis(true);
    await expect(proc.process(CRON_JOBS.sessionsCleanup)).resolves.toEqual({
      skipped: 'previous run still active',
    });
    expect(p.sessions.run).not.toHaveBeenCalled();
    expect(redis.set).toHaveBeenCalledWith(
      `lock:job:cron:${CRON_JOBS.sessionsCleanup}`,
      expect.any(String),
      'PX',
      expect.any(Number),
      'NX',
    );
  });

  it('runs and releases when the lock is free', async () => {
    const { proc, p, redis } = withRedis(false);
    await expect(proc.process(CRON_JOBS.sessionsCleanup)).resolves.toEqual({
      deleted: 1,
    });
    expect(p.sessions.run).toHaveBeenCalledTimes(1);
    expect(redis.eval).toHaveBeenCalled();
  });
});

describe('CronProcessor', () => {
  it('routes each job name to its handler', async () => {
    const p = processor();
    await expect(
      p.processor.process(CRON_JOBS.sessionsCleanup),
    ).resolves.toEqual({ deleted: 1 });
    await expect(p.processor.process(CRON_JOBS.otpCleanup)).resolves.toEqual({
      deleted: 2,
    });
    await expect(
      p.processor.process(CRON_JOBS.disposableDomainsRefresh),
    ).resolves.toEqual({ status: 'updated' });
    await expect(p.processor.process(CRON_JOBS.licenseExpiry)).resolves.toEqual(
      { expired: 3 },
    );
    expect(p.licenses.run).toHaveBeenCalledTimes(1);
    expect(p.sessions.run).toHaveBeenCalledTimes(1);
    expect(p.otp.run).toHaveBeenCalledTimes(1);
    expect(p.disposable.run).toHaveBeenCalledTimes(1);
    await expect(
      p.processor.process(CRON_JOBS.reviewReminder),
    ).resolves.toEqual({ sent: 3 });
    await expect(
      p.processor.process(CRON_JOBS.ratingReconcile),
    ).resolves.toEqual({ scanned: 4, fixed: 1 });
    expect(p.reminder.run).toHaveBeenCalledTimes(1);
    expect(p.reconcile.run).toHaveBeenCalledTimes(1);
    await expect(
      p.processor.process(CRON_JOBS.bidSubscriptionLapse),
    ).resolves.toEqual({ attorneysChecked: 5, bidsWithdrawn: 1 });
    expect(p.bidLapse.run).toHaveBeenCalledTimes(1);
    for (const [name, job] of [
      [CRON_JOBS.caseStaleAsk, p.stale],
      [CRON_JOBS.caseStalePause, p.archive],
      [CRON_JOBS.caseAutoClose, p.autoClose],
      [CRON_JOBS.caseCompletionReminder, p.completion],
    ] as const) {
      await expect(p.processor.process(name)).resolves.toEqual({
        processed: 1,
        ran: true,
      });
      expect(job.run).toHaveBeenCalledTimes(1);
    }
    await expect(
      p.processor.process(CRON_JOBS.countersReconcile),
    ).resolves.toEqual({
      flushed: 1,
      reconciled: 2,
    });
  });

  it('skips heavy jobs while «Пауза тяжёлых задач» is on (owner 2026-10-05)', async () => {
    const p = processor();
    Object.assign(p.processor as unknown as Record<string, unknown>, {
      opsState: { isHeavyPaused: jest.fn(() => Promise.resolve(true)) },
    });
    await expect(
      p.processor.process(CRON_JOBS.countersReconcile),
    ).resolves.toEqual({
      skipped: 'heavy jobs paused',
    });
    expect(p.countersRecon.run).not.toHaveBeenCalled();
    // Light jobs (reminders, cleanups) keep running.
    await expect(
      p.processor.process(CRON_JOBS.sessionsCleanup),
    ).resolves.toEqual({
      deleted: 1,
    });
  });

  it('fails unknown job names instead of silently succeeding', async () => {
    await expect(processor().processor.process('nope')).rejects.toThrow(
      'Unknown cron job: nope',
    );
  });
});
