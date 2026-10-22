import { PostInsightsService } from './post-insights.service';

/** Owner 2026-10-22 (client economy plan, package A): views ride in the
 * same batch as impressions — one POST for a whole scroll. */
describe('PostInsightsService.record (batched views)', () => {
  function setup(posts: { id: string; author_id: string }[]) {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const record = jest.fn().mockResolvedValue(true);
    const prisma = {
      post: { findMany: jest.fn().mockResolvedValue(posts) },
      postView: { createMany },
    };
    const service = new PostInsightsService(
      prisma as never,
      { record } as never,
    );
    return { service, createMany, record };
  }
  const me = { sub: 'me', role: 'client' } as never;

  it('three views in one batch = three counters, one seen-row insert', async () => {
    const { service, createMany, record } = setup([
      { id: 'p1', author_id: 'a1' },
      { id: 'p2', author_id: 'a2' },
      { id: 'p3', author_id: 'a3' },
    ]);
    await service.record(me, [
      { postId: 'p1', kind: 'view' },
      { postId: 'p2', kind: 'view' },
      { postId: 'p3', kind: 'view' },
      { postId: 'p1', kind: 'view' }, // a duplicate inside the batch
    ]);
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0][0].data).toHaveLength(3);
    expect(record).toHaveBeenCalledTimes(3);
    expect(record).toHaveBeenCalledWith({
      postId: 'p2',
      authorId: 'a2',
      viewerId: 'me',
      kind: 'view',
    });
  });

  it('impressions do not write seen rows; own and unknown posts are skipped', async () => {
    const { service, createMany, record } = setup([
      { id: 'p1', author_id: 'me' },
      { id: 'p2', author_id: 'a2' },
    ]);
    await service.record(me, [
      { postId: 'p1', kind: 'view' },
      { postId: 'p2', kind: 'impression' },
      { postId: 'gone', kind: 'view' },
    ]);
    expect(createMany).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 'p2', kind: 'impression' }),
    );
  });

  it("an assistant's browsing is not recorded", async () => {
    const { service, record } = setup([{ id: 'p1', author_id: 'a1' }]);
    await service.record(
      { sub: 'x', assistant: { attorneyId: 'a' } } as never,
      [{ postId: 'p1', kind: 'view' }],
    );
    expect(record).not.toHaveBeenCalled();
  });
});
