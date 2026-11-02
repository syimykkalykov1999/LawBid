import { PostFanoutService } from './post-fanout.service';

/** Audit A-1: without Redis the post alert runs inline; with a queue it only
 * schedules the first batch and each batch chains the next by cursor. */
describe('PostFanoutService', () => {
  const alerts = () => ({
    followersOfPost: jest.fn(() => Promise.resolve(7)),
    alertBatch: jest.fn(),
  });

  it('runs inline without a queue', async () => {
    const a = alerts();
    const svc = new PostFanoutService(
      { get: () => undefined } as never,
      a as never,
    );
    expect(await svc.start('au', 'p1', true)).toBe(7);
    expect(a.followersOfPost).toHaveBeenCalledWith('au', 'p1', true);
  });

  it('chains the next batch by cursor with an idempotent job id', async () => {
    const a = alerts();
    a.alertBatch.mockResolvedValueOnce({ sent: 500, next: 'u-500' });
    const svc = new PostFanoutService(
      { get: () => undefined } as never,
      a as never,
    );
    const add = jest.fn(() => Promise.resolve());
    (svc as unknown as { queue: unknown }).queue = { add };
    const sent = await svc.runBatch({
      authorId: 'au',
      postId: 'p1',
      brief: false,
      after: null,
      done: 0,
    });
    expect(sent).toBe(500);
    expect(add).toHaveBeenCalledWith(
      'batch',
      expect.objectContaining({ after: 'u-500', done: 500 }),
      expect.objectContaining({ jobId: 'p1-u-500' }),
    );
  });

  it('stops at the end of the audience and at the cap', async () => {
    const a = alerts();
    const svc = new PostFanoutService(
      { get: () => undefined } as never,
      a as never,
    );
    const add = jest.fn(() => Promise.resolve());
    (svc as unknown as { queue: unknown }).queue = { add };
    a.alertBatch.mockResolvedValueOnce({ sent: 3, next: null });
    await svc.runBatch({
      authorId: 'a',
      postId: 'p',
      brief: false,
      after: 'x',
      done: 0,
    });
    a.alertBatch.mockResolvedValueOnce({ sent: 500, next: 'y' });
    await svc.runBatch({
      authorId: 'a',
      postId: 'p',
      brief: false,
      after: 'x',
      done: 99_800,
    });
    expect(add).not.toHaveBeenCalled();
  });
});
