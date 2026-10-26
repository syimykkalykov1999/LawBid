import { FILE_SCAN_BASE_PRIORITY, FileScanRunner } from './file-scan.runner';

jest.mock('bullmq', () => {
  const redis = {
    incr: jest.fn(),
    expire: jest.fn(() => Promise.resolve(1)),
  };
  const queue = {
    getJob: jest.fn(),
    add: jest.fn(() => Promise.resolve({})),
    close: jest.fn(() => Promise.resolve()),
  };
  return {
    Queue: jest.fn(() => queue),
    Worker: jest.fn(() => ({ on: jest.fn(), close: jest.fn() })),
    MetricsTime: { ONE_HOUR: 60 },
    __queue: queue,
    __redis: redis,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mocked = require('bullmq') as {
  __queue: { getJob: jest.Mock; add: jest.Mock };
  __redis: { incr: jest.Mock; expire: jest.Mock };
};

function runner(): FileScanRunner {
  const r = new FileScanRunner(
    { mode: 'api' },
    { getOrThrow: () => 'redis://x', get: () => false } as never,
    {} as never,
    { setContext: jest.fn(), error: jest.fn() } as never,
    mocked.__redis as never,
  );
  r.onApplicationBootstrap();
  return r;
}

describe('FileScanRunner.enqueueScan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked.__queue.getJob.mockResolvedValue(undefined);
    mocked.__redis.incr.mockResolvedValue(1);
  });

  it('S10-12: a finished job with the same id is removed so a rescan really runs', async () => {
    const remove = jest.fn(() => Promise.resolve());
    mocked.__queue.getJob.mockResolvedValue({
      getState: () => Promise.resolve('completed'),
      remove,
    });
    await runner().enqueueScan('f1', 'u1');
    expect(remove).toHaveBeenCalled();
    expect(mocked.__queue.add).toHaveBeenCalledWith(
      'files.scan',
      { fileId: 'f1' },
      expect.objectContaining({ jobId: 'f1' }),
    );
  });

  it('S10-12: a failed job is replaced too', async () => {
    const remove = jest.fn(() => Promise.resolve());
    mocked.__queue.getJob.mockResolvedValue({
      getState: () => Promise.resolve('failed'),
      remove,
    });
    await runner().enqueueScan('f1');
    expect(remove).toHaveBeenCalled();
    expect(mocked.__queue.add).toHaveBeenCalledTimes(1);
  });

  it('a scan that is still waiting or running is not added twice', async () => {
    for (const state of ['waiting', 'active', 'delayed', 'prioritized']) {
      mocked.__queue.add.mockClear();
      mocked.__queue.getJob.mockResolvedValue({
        getState: () => Promise.resolve(state),
        remove: jest.fn(),
      });
      await runner().enqueueScan('f1', 'u1');
      expect(mocked.__queue.add).not.toHaveBeenCalled();
    }
  });

  it('S10-11: a normal upload keeps the base priority, a flood falls behind', async () => {
    mocked.__redis.incr.mockResolvedValue(2);
    await runner().enqueueScan('f1', 'u1');
    const first = mocked.__queue.add.mock.calls[0][2] as { priority: number };
    expect(first.priority).toBe(FILE_SCAN_BASE_PRIORITY);
    expect(mocked.__redis.expire).not.toHaveBeenCalled();

    mocked.__redis.incr.mockResolvedValue(300);
    await runner().enqueueScan('f2', 'u1');
    const flood = mocked.__queue.add.mock.calls[1][2] as { priority: number };
    expect(flood.priority).toBeGreaterThan(first.priority);
  });

  it('S10-11: the window of the per-owner counter is set on its first file', async () => {
    mocked.__redis.incr.mockResolvedValue(1);
    await runner().enqueueScan('f1', 'u9');
    expect(mocked.__redis.expire).toHaveBeenCalledWith('scan:fair:u9', 600);
  });

  it('a Redis hiccup in the fairness counter never blocks the upload', async () => {
    mocked.__redis.incr.mockRejectedValue(new Error('x'));
    await runner().enqueueScan('f1', 'u1');
    expect(mocked.__queue.add).toHaveBeenCalledTimes(1);
  });
});
