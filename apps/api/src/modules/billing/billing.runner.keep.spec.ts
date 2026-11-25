import { KEEP_SCHEDULER_EVERY_MS } from '../../common/queues/keep-scheduler';
import { TRIAL_REMINDER_RECONCILE_JOB } from './billing.constants';
import { BillingRunner } from './billing.runner';

/** A Redis that "lost" every scheduler: getJobScheduler finds nothing. */
const queue = {
  upsertJobScheduler: jest.fn(() => Promise.resolve({})),
  getJobScheduler: jest.fn(() => Promise.resolve(undefined)),
  close: jest.fn(() => Promise.resolve()),
};
jest.mock('bullmq', () => ({
  Queue: jest.fn(() => queue),
  Worker: jest.fn(() => ({
    on: jest.fn(),
    close: jest.fn(() => Promise.resolve()),
    name: 'w',
  })),
}));

describe('BillingRunner trial reminder reconcile (pack C, round 2 #11)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('re-registers the hourly reconcile after Redis lost it, not only at boot', async () => {
    const runner = new BillingRunner(
      { mode: 'worker' },
      { get: () => 'redis://localhost:6379' } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    runner.onApplicationBootstrap();
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(KEEP_SCHEDULER_EVERY_MS);
    expect(queue.getJobScheduler).toHaveBeenCalledWith(
      TRIAL_REMINDER_RECONCILE_JOB,
    );
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
    expect(queue.upsertJobScheduler).toHaveBeenLastCalledWith(
      TRIAL_REMINDER_RECONCILE_JOB,
      { every: 3_600_000 },
      expect.objectContaining({ name: TRIAL_REMINDER_RECONCILE_JOB }),
    );
    await runner.onModuleDestroy();
  });
});
