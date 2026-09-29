import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { Queue, Worker } from 'bullmq';
import { JobsRunner, CRON_JOB_TEMPLATE_OPTS } from './jobs.runner';
import { CronProcessor } from './cron.processor';
import { CRON_JOBS, CRON_QUEUE, CRON_SCHEDULES } from './jobs.constants';
import type { SessionsCleanupJob } from './handlers/sessions-cleanup.job';
import type { OtpCleanupJob } from './handlers/otp-cleanup.job';
import type { DisposableDomainsRefreshJob } from './disposable-domains/disposable-domains-refresh.job';
import type { ReviewReminderJob } from './handlers/review-reminder.job';
import type { RatingReconcileJob } from './handlers/rating-reconcile.job';
import type { LicenseExpiryJob } from './handlers/license-expiry.job';
import type { BidSubscriptionLapseJob } from './handlers/bid-subscription-lapse.job';
import {
  CaseAutoArchiveJob,
  CaseAutoCloseJob,
  CaseCompletionReminderJob,
  CaseStalePromptJob,
} from './handlers/case-lifecycle.jobs';
import { CountersReconcileJob } from './handlers/counters-reconcile.job';
import { FeedRecoJob } from '../modules/feed/feed-reco.job';

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
      bidLapse as unknown as BidSubscriptionLapseJob,
      stale as unknown as CaseStalePromptJob,
      archive as unknown as CaseAutoArchiveJob,
      autoClose as unknown as CaseAutoCloseJob,
      completion as unknown as CaseCompletionReminderJob,
      countersRecon as unknown as CountersReconcileJob,
      { run: jest.fn() } as unknown as FeedRecoJob,
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
    expect(upserts).toHaveLength(13);
    const byName = Object.fromEntries(
      upserts.map((c: unknown[]) => [c[0], c[1]]),
    );
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
      expect(call[2]).toEqual({ name: call[0], opts: CRON_JOB_TEMPLATE_OPTS });
    }
    // Stale scheduler from an older release is removed, current ones kept.
    expect(mocked.__queue.removeJobScheduler).toHaveBeenCalledTimes(1);
    expect(mocked.__queue.removeJobScheduler).toHaveBeenCalledWith(
      'legacy.job.removed-in-this-release',
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
    expect(Worker).toHaveBeenCalledTimes(1);
    await runner.onApplicationShutdown();
  });

  it('has one schedule per job name', () => {
    const names = CRON_SCHEDULES.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(names)).toEqual(new Set(Object.values(CRON_JOBS)));
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
      [CRON_JOBS.caseStalePrompt, p.stale],
      [CRON_JOBS.caseAutoArchive, p.archive],
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

  it('fails unknown job names instead of silently succeeding', async () => {
    await expect(processor().processor.process('nope')).rejects.toThrow(
      'Unknown cron job: nope',
    );
  });
});
