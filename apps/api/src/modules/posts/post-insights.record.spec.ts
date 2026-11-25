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

/** Owner 25.11: ended reel views (watch time) for the reels model. */
describe('PostInsightsService.recordWatch', () => {
  function setup(posts: { id: string; author_id: string }[], kept = true) {
    const logWatch = jest.fn().mockResolvedValue(undefined);
    const events = {
      keepsImpressionsOf: jest.fn().mockResolvedValue(kept),
      logWatch,
    };
    const findMany = jest.fn().mockResolvedValue(posts);
    const service = new PostInsightsService(
      { post: { findMany } } as never,
      { record: jest.fn() } as never,
      events as never,
    );
    return { service, logWatch, findMany };
  }
  const me = { sub: 'me', role: 'client' } as never;
  const w = (postId: string, viewId: string, completed = false) => ({
    postId,
    viewId,
    watchedMs: 4200,
    durationMs: 9000,
    completed,
  });

  it('one watch per view id; only visible videos of other people', async () => {
    const { service, logWatch, findMany } = setup([
      { id: 'r1', author_id: 'a1' },
      { id: 'mine', author_id: 'me' },
    ]);
    await service.recordWatch(me, [
      w('r1', 'v1'),
      w('r1', 'v1', true), // the same view reported again (a retry)
      w('r1', 'v2', true),
      w('mine', 'v3'),
      w('gone', 'v4'),
    ]);
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      video_asset_id: { not: null },
    });
    expect(
      logWatch.mock.calls.map((c) => [
        (c[1] as { viewId: string }).viewId,
        (c[1] as { completed: boolean }).completed,
      ]),
    ).toEqual([
      ['v1', true],
      ['v2', true],
    ]);
    expect(logWatch).toHaveBeenCalledWith('me', {
      postId: 'r1',
      viewId: 'v2',
      watchedMs: 4200,
      durationMs: 9000,
      completed: true,
    });
  });

  it('outside the impression sample, or an assistant: nothing is read', async () => {
    const out = setup([{ id: 'r1', author_id: 'a1' }], false);
    await out.service.recordWatch(me, [w('r1', 'v1')]);
    expect(out.findMany).not.toHaveBeenCalled();
    const asst = setup([{ id: 'r1', author_id: 'a1' }]);
    await asst.service.recordWatch(
      { sub: 'x', assistant: { attorneyId: 'a' } } as never,
      [w('r1', 'v1')],
    );
    expect(asst.logWatch).not.toHaveBeenCalled();
  });
});
