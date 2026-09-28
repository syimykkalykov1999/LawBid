import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { Queue, Worker } from 'bullmq';
import { JobsRunner, CRON_JOB_TEMPLATE_OPTS } from './jobs.runner';
import { CronProcessor } from './cron.processor';
import { CRON_JOBS, CRON_QUEUE, CRON_SCHEDULES } from './jobs.constants';
import type { SessionsCleanupJob } from './handlers/sessions-cleanup.job';
import type { OtpCleanupJob } from './handlers/otp-cleanup.job';
import type { DisposableDomainsRefreshJob } from './disposable-domains/disposable-domains-refresh.job';
import type { LicenseExpiryJob } from './handlers/license-expiry.job';

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
  const licenses = { run: jest.fn(() => Promise.resolve({ expired: 3 })) };
  return {
    sessions,
    otp,
    disposable,
    licenses,
    processor: new CronProcessor(
      sessions as unknown as SessionsCleanupJob,
      otp as unknown as OtpCleanupJob,
      disposable as unknown as DisposableDomainsRefreshJob,
      licenses as unknown as LicenseExpiryJob,
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
    expect(upserts).toHaveLength(4);
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
    expect(byName[CRON_JOBS.licenseExpiry]).toEqual({
      pattern: expect.stringMatching(/^\d+ \d+ \* \* \*$/),
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
  });

  it('fails unknown job names instead of silently succeeding', async () => {
    await expect(processor().processor.process('nope')).rejects.toThrow(
      'Unknown cron job: nope',
    );
  });
});
