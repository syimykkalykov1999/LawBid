import { KEEP_SCHEDULER_EVERY_MS } from '../../common/queues/keep-scheduler';
import { MEDIA_REHIDE_SWEEP_JOB } from './media-moderation.constants';
import { MediaModerationRunner } from './media-moderation.runner';

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
    isRunning: () => true,
  })),
}));

describe('MediaModerationRunner (pack C, round 2 #11)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('puts the hourly rehide sweep back when Redis lost it, not only at boot', async () => {
    const runner = new MediaModerationRunner(
      { mode: 'worker' } as never,
      { get: () => 'redis://localhost:6379' } as never,
      {} as never,
      { setContext: jest.fn(), warn: jest.fn(), error: jest.fn() } as never,
    );
    runner.onApplicationBootstrap();
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      MEDIA_REHIDE_SWEEP_JOB,
      { every: 3_600_000 },
      expect.objectContaining({ name: MEDIA_REHIDE_SWEEP_JOB }),
    );
    // The heartbeat after the loss finds it missing and re-registers it.
    await jest.advanceTimersByTimeAsync(KEEP_SCHEDULER_EVERY_MS);
    expect(queue.getJobScheduler).toHaveBeenCalledWith(MEDIA_REHIDE_SWEEP_JOB);
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
    await runner.onApplicationShutdown();
    await jest.advanceTimersByTimeAsync(KEEP_SCHEDULER_EVERY_MS * 3);
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
  });
});
