import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PostEngagementService } from './post-engagement.service';

/** Owner 2026-10-07: Threads-style reposts — idempotent, never of one's
 * own post, blocked either way like likes, notifies the author once. */
describe('PostEngagementService reposts', () => {
  function setup(opts: {
    author?: string;
    visible?: boolean;
    blocked?: boolean;
    inserted?: number;
  }) {
    const consume = jest.fn().mockResolvedValue(undefined);
    const emit = jest.fn().mockResolvedValue(null);
    const createMany = jest
      .fn()
      .mockResolvedValue({ count: opts.inserted ?? 1 });
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
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
      userBlock: {
        findFirst: jest
          .fn()
          .mockResolvedValue(opts.blocked ? { blocker_id: 'author' } : null),
      },
      postRepost: { createMany, deleteMany },
    };
    const service = new PostEngagementService(
      prisma as never,
      { consume } as never,
      {} as never,
      { emit } as never,
      {} as never,
    );
    return { service, consume, emit, createMany, deleteMany };
  }

  it('reposts and notifies the author', async () => {
    const { service, consume, emit, createMany } = setup({});
    await service.repost('me', 'p1');
    expect(consume).toHaveBeenCalledWith('like', 'me');
    expect(createMany).toHaveBeenCalledWith({
      data: [{ post_id: 'p1', user_id: 'me' }],
      skipDuplicates: true,
    });
    expect(emit).toHaveBeenCalledWith({
      type: 'post_repost',
      recipientId: 'author',
      payload: { postId: 'p1', actorId: 'me' },
    });
  });

  it('is idempotent: a repeat inserts nothing and does not notify', async () => {
    const { service, emit } = setup({ inserted: 0 });
    await service.repost('me', 'p1');
    expect(emit).not.toHaveBeenCalled();
  });

  it("refuses one's own post with 409 REPOST_OWN_POST", async () => {
    const { service, createMany, consume } = setup({ author: 'me' });
    await expect(service.repost('me', 'p1')).rejects.toMatchObject({
      constructor: ConflictException,
      response: { code: ErrorCode.REPOST_OWN_POST },
    });
    expect(createMany).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });

  it('refuses when either side blocked the other', async () => {
    const { service, createMany } = setup({ blocked: true });
    await expect(service.repost('me', 'p1')).rejects.toMatchObject({
      constructor: ForbiddenException,
      response: { code: ErrorCode.USER_BLOCKED },
    });
    expect(createMany).not.toHaveBeenCalled();
  });

  it('a hidden or deleted post is POST_NOT_FOUND', async () => {
    const { service } = setup({ visible: false });
    await expect(service.repost('me', 'p1')).rejects.toMatchObject({
      response: { code: ErrorCode.POST_NOT_FOUND },
    });
  });

  it('undo removes only the viewer’s row (idempotent)', async () => {
    const { service, deleteMany } = setup({});
    await service.unrepost('me', 'p1');
    await service.unrepost('me', 'p1');
    expect(deleteMany).toHaveBeenCalledTimes(2);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { post_id: 'p1', user_id: 'me' },
    });
  });
});
