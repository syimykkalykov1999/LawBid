import { ForbiddenException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { CommentsService } from './comments.service';

/** Row 63 (like spike 12.11): a comment like is one INSERT … ON CONFLICT
 * DO NOTHING with the comment's own shard, idempotent, and its
 * notification does not repeat the block check just made. */
describe('CommentsService like', () => {
  function setup(opts: {
    inserted?: number;
    blocked?: boolean;
    author?: string;
  }) {
    const consume = jest.fn().mockResolvedValue(undefined);
    const bump = jest.fn().mockResolvedValue(undefined);
    const emit = jest.fn().mockResolvedValue(null);
    const executeRaw = jest.fn().mockResolvedValue(opts.inserted ?? 1);
    const findFirst = jest.fn().mockResolvedValue({
      id: 'c1',
      author_id: opts.author ?? 'author',
      post_id: 'p1',
      shard_id: 3,
    });
    const prisma = {
      comment: { findFirst },
      userBlock: {
        findFirst: jest
          .fn()
          .mockResolvedValue(opts.blocked ? { blocker_id: 'author' } : null),
      },
      commentLike: { createMany: jest.fn() },
      $executeRaw: executeRaw,
    };
    const service = new CommentsService(
      prisma as never,
      { consume } as never,
      { bump } as never,
      { emit } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, consume, bump, emit, executeRaw, findFirst, prisma };
  }

  it('one statement with the comment shard, counter +1, author notified', async () => {
    const { service, bump, emit, executeRaw, findFirst, prisma } = setup({});
    await service.like('me', 'c1');
    expect(findFirst.mock.calls[0][0].select).toMatchObject({ shard_id: true });
    expect(prisma.commentLike.createMany).not.toHaveBeenCalled();
    const [strings, ...values] = executeRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(strings.join('?').replace(/\s+/g, ' ').trim()).toBe(
      'INSERT INTO comment_likes (comment_id, user_id, shard_id) VALUES (?::UUID, ?::UUID, ?::SMALLINT) ON CONFLICT DO NOTHING',
    );
    expect(values).toEqual(['c1', 'me', 3]);
    expect(bump).toHaveBeenCalledWith('comment', 'c1', 'like_count', 1);
    expect(emit).toHaveBeenCalledWith({
      type: 'comment_like',
      recipientId: 'author',
      payload: { postId: 'p1', commentId: 'c1', actorId: 'me' },
      actorBlockChecked: true,
    });
  });

  it('a repeat inserts nothing: no counter move, no notification', async () => {
    const { service, bump, emit } = setup({ inserted: 0 });
    await service.like('me', 'c1');
    expect(bump).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('a block either way refuses before the rate limit and the insert', async () => {
    const { service, consume, executeRaw } = setup({ blocked: true });
    await expect(service.like('me', 'c1')).rejects.toMatchObject({
      constructor: ForbiddenException,
      response: { code: ErrorCode.USER_BLOCKED },
    });
    expect(consume).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
  });
});
