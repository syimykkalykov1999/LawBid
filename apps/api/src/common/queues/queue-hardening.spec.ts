import {
  closeWorker,
  fairPriority,
  isStalledFailure,
  parseQueueMode,
  resetDrainDeadlineForTests,
  workerTuning,
} from './queue-hardening';

describe('workerTuning', () => {
  it('keeps BullMQ defaults for an unlisted queue', () => {
    expect(workerTuning('some-new-queue')).toMatchObject({
      lockDuration: 30_000,
      stalledInterval: 30_000,
      maxStalledCount: 1,
    });
    expect(
      workerTuning('some-new-queue').metrics.maxDataPoints,
    ).toBeGreaterThan(0);
  });

  it('gives CPU-heavy / long queues a longer lock and more stalled retries', () => {
    for (const q of ['files', 'data-export', 'case-history-export']) {
      const t = workerTuning(q);
      expect(t.lockDuration).toBeGreaterThan(30_000);
      expect(t.maxStalledCount).toBeGreaterThanOrEqual(2);
      // the lock is renewed twice per lockDuration; the stalled check
      // must not run faster than the lock can be renewed
      expect(t.stalledInterval).toBeGreaterThanOrEqual(30_000);
    }
  });
});

describe('isStalledFailure', () => {
  it('recognises the BullMQ stalled-more-than-allowed failure', () => {
    expect(
      isStalledFailure(new Error('job stalled more than allowable limit')),
    ).toBe(true);
    expect(isStalledFailure(new Error('ECONNRESET'))).toBe(false);
  });
});

describe('parseQueueMode', () => {
  it('accepts off|on|auto and falls back to auto', () => {
    expect(parseQueueMode('off')).toBe('off');
    expect(parseQueueMode('on')).toBe('on');
    expect(parseQueueMode('auto')).toBe('auto');
    expect(parseQueueMode('weird')).toBe('auto');
    expect(parseQueueMode(undefined)).toBe('auto');
  });
});

describe('fairPriority', () => {
  it('lets a user with few pending jobs keep the base priority', () => {
    expect(fairPriority(0, 5)).toBe(5);
    expect(fairPriority(3, 5)).toBe(5);
  });
  it('pushes a flooding user behind the others, bounded', () => {
    expect(fairPriority(100, 5)).toBeGreaterThan(fairPriority(5, 5));
    expect(fairPriority(1_000_000, 5)).toBeLessThanOrEqual(5 + 20);
  });
});

describe('closeWorker', () => {
  beforeEach(() => resetDrainDeadlineForTests());

  it('returns drained when the worker finishes inside the budget', async () => {
    const worker = { close: jest.fn(() => Promise.resolve()) };
    await expect(closeWorker(worker, 1_000)).resolves.toBe('drained');
    expect(worker.close).toHaveBeenCalledTimes(1);
  });

  it('stops waiting after the budget (the stalled job is reclaimed later)', async () => {
    jest.useFakeTimers();
    const worker = { close: jest.fn(() => new Promise<void>(() => undefined)) };
    const p = closeWorker(worker, 5_000);
    await jest.advanceTimersByTimeAsync(5_001);
    await expect(p).resolves.toBe('timed-out');
    jest.useRealTimers();
  });

  it('is a no-op for a worker that never started', async () => {
    await expect(closeWorker(undefined)).resolves.toBe('none');
  });

  it('never throws when close() rejects', async () => {
    const worker = { close: jest.fn(() => Promise.reject(new Error('x'))) };
    await expect(closeWorker(worker, 1_000)).resolves.toBe('drained');
  });
});
