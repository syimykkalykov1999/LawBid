/* eslint-disable @typescript-eslint/require-await -- hand-made Prisma fakes */
import { CommentsService } from './comments.service';

/**
 * Pack B (25.11, ROUND2 #6): deleting a comment tells the people who have
 * the post open (room `post:{id}`, as `comment:new` does), so the comment
 * and the count go at once instead of staying until the post is reopened.
 * A held comment nobody saw, or a repeated DELETE, sends nothing.
 */
describe('CommentsService.remove sends comment:deleted', () => {
  function make(row: {
    parent_comment_id: string | null;
    status: 'published' | 'hidden';
    claimed?: number;
    replies?: number;
  }) {
    const tx = {
      comment: {
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: row.claimed ?? 1 })
          .mockResolvedValue({ count: row.replies ?? 0 }),
        count: jest.fn(async () => row.replies ?? 0),
      },
    };
    const prisma = {
      comment: {
        findFirst: jest.fn(async () => ({
          id: 'c1',
          author_id: 'me',
          post_id: 'p1',
          parent_comment_id: row.parent_comment_id,
          status: row.status,
          post: { author_id: 'author' },
        })),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const counters = { bump: jest.fn(async () => undefined) };
    const realtime = { toRoom: jest.fn() };
    const service = new CommentsService(
      prisma as never,
      {} as never,
      counters as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      realtime as never,
    );
    return { service, realtime };
  }

  it('a top-level comment: the room hears it with its replies counted', async () => {
    const { service, realtime } = make({
      parent_comment_id: null,
      status: 'published',
      replies: 2,
    });
    await service.remove('me', 'c1');
    expect(realtime.toRoom).toHaveBeenCalledWith('post:p1', 'comment:deleted', {
      postId: 'p1',
      commentId: 'c1',
      parentCommentId: null,
      removed: 3,
    });
  });

  it('a reply names its parent', async () => {
    const { service, realtime } = make({
      parent_comment_id: 'c0',
      status: 'published',
    });
    await service.remove('me', 'c1');
    expect(realtime.toRoom).toHaveBeenCalledWith('post:p1', 'comment:deleted', {
      postId: 'p1',
      commentId: 'c1',
      parentCommentId: 'c0',
      removed: 1,
    });
  });

  it('a held comment or a repeated delete sends nothing', async () => {
    const held = make({ parent_comment_id: null, status: 'hidden' });
    await held.service.remove('me', 'c1');
    expect(held.realtime.toRoom).not.toHaveBeenCalled();
    const again = make({
      parent_comment_id: null,
      status: 'published',
      claimed: 0,
    });
    await again.service.remove('me', 'c1');
    expect(again.realtime.toRoom).not.toHaveBeenCalled();
  });
});
