import type { ConfigService } from '@nestjs/config';

const add = jest.fn().mockResolvedValue(undefined);
const getJob = jest.fn();
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add,
    getJob,
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { OneOffJobsQueue } from './one-off-jobs.queue';

/**
 * Final pass 18.11 (FB6): BullMQ ignores an add whose job id still exists,
 * and a failed job is kept (removeOnFail count 200). One failed run of a
 * fixed-id job («Пересчитать всех») made every later press answer «queued»
 * while nothing ran. A failed job under the id is removed first; a waiting
 * or running one still swallows the duplicate, as designed.
 */
describe('OneOffJobsQueue.add', () => {
  const config = {
    get: jest.fn().mockReturnValue('redis://localhost:6379'),
  } as unknown as ConfigService;

  beforeEach(() => {
    add.mockClear();
    getJob.mockReset();
  });

  it('FB6: a failed job under the same id is removed, so the new add runs', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    getJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('failed'),
      remove,
    });
    const q = new OneOffJobsQueue(config);
    await expect(
      q.add('trust.recompute-all', {}, 'trust-recompute-all', 0),
    ).resolves.toBe(true);
    expect(remove).toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith(
      'trust.recompute-all',
      {},
      expect.objectContaining({ jobId: 'trust-recompute-all' }),
    );
  });

  it('a waiting or running job under the id is kept (N instances, one job)', async () => {
    const remove = jest.fn();
    getJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('active'),
      remove,
    });
    const q = new OneOffJobsQueue(config);
    await q.add('trust.recompute-all', {}, 'trust-recompute-all', 0);
    expect(remove).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalled();
  });
});
