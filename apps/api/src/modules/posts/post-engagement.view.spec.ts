import { PostEngagementService } from './post-engagement.service';

/** Owner 2026-10-12: a view of a video post / reel — one per viewer, never
 * the author's own, a repeat adds nothing. */
describe('PostEngagementService views', () => {
  function setup(opts: {
    author?: string;
    inserted?: number;
    visible?: boolean;
  }) {
    const createMany = jest
      .fn()
      .mockResolvedValue({ count: opts.inserted ?? 1 });
    const bump = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      post: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            opts.visible === false
              ? null
              : { id: 'p1', author_id: opts.author ?? 'author' },
          ),
      },
      postView: { createMany },
    };
    const service = new PostEngagementService(
      prisma as never,
      {} as never,
      { bump } as never,
      {} as never,
      {} as never,
    );
    return { service, createMany, bump };
  }

  it('counts the first view of a viewer', async () => {
    const { service, createMany, bump } = setup({});
    await service.view('me', 'p1');
    expect(createMany).toHaveBeenCalledWith({
      data: [{ post_id: 'p1', user_id: 'me' }],
      skipDuplicates: true,
    });
    expect(bump).toHaveBeenCalledWith('post', 'p1', 'view_count', 1);
  });

  it('a repeat view adds nothing', async () => {
    const { service, bump } = setup({ inserted: 0 });
    await service.view('me', 'p1');
    expect(bump).not.toHaveBeenCalled();
  });

  it("the author's own view is not counted", async () => {
    const { service, createMany, bump } = setup({ author: 'me' });
    await service.view('me', 'p1');
    expect(createMany).not.toHaveBeenCalled();
    expect(bump).not.toHaveBeenCalled();
  });

  it('a hidden or deleted post is POST_NOT_FOUND', async () => {
    const { service } = setup({ visible: false });
    await expect(service.view('me', 'p1')).rejects.toMatchObject({
      response: { code: 'POST_NOT_FOUND' },
    });
  });
});
