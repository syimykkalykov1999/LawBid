import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PostEngagementService } from './post-engagement.service';

/** Row 63 (like spike 12.11): a like is one INSERT … ON CONFLICT DO
 * NOTHING (no BEGIN/COMMIT, no second read of the post's shard), the
 * counter and the notification move only when a row was inserted, and the
 * notification does not repeat the block check just made. */
describe('PostEngagementService like', () => {
  function setup(opts: {
    author?: string;
    visible?: boolean;
    blocked?: boolean;
    inserted?: number;
    shard?: number;
  }) {
    const calls: string[] = [];
    const consume = jest.fn(() => {
      calls.push('consume');
      return Promise.resolve();
    });
    const emit = jest.fn().mockResolvedValue(null);
    const bump = jest.fn().mockResolvedValue(undefined);
    const executeRaw = jest.fn(() => {
      calls.push('insert');
      return Promise.resolve(opts.inserted ?? 1);
    });
    const createMany = jest.fn();
    const findFirst = jest.fn().mockResolvedValue(
      opts.visible === false
        ? null
        : {
            id: 'p1',
            author_id: opts.author ?? 'author',
            hide_likes: false,
            shard_id: opts.shard ?? 7,
          },
    );
    const prisma = {
      post: { findFirst },
      userBlock: {
        findFirst: jest.fn(() => {
          calls.push('block');
          return Promise.resolve(
            opts.blocked ? { blocker_id: 'author' } : null,
          );
        }),
      },
      postLike: { createMany },
      $executeRaw: executeRaw,
    };
    const service = new PostEngagementService(
      prisma as never,
      { consume } as never,
      { bump } as never,
      { emit } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return {
      service,
      consume,
      emit,
      bump,
      executeRaw,
      createMany,
      findFirst,
      calls,
    };
  }

  /** The SQL text and the bound values of the tagged-template call. */
  function sqlOf(mock: jest.Mock): { text: string; values: unknown[] } {
    const [strings, ...values] = mock.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    return { text: strings.join('?').replace(/\s+/g, ' ').trim(), values };
  }

  it('inserts with one statement, bumps the counter, notifies the author', async () => {
    const { service, emit, bump, executeRaw, createMany, findFirst, calls } =
      setup({});
    await service.like('me', 'p1');
    expect(findFirst.mock.calls[0][0].select).toMatchObject({
      author_id: true,
      shard_id: true,
    });
    expect(calls).toEqual(['block', 'consume', 'insert']);
    expect(createMany).not.toHaveBeenCalled();
    const { text, values } = sqlOf(executeRaw);
    expect(text).toBe(
      'INSERT INTO post_likes (post_id, user_id, shard_id) VALUES (?::UUID, ?::UUID, ?::SMALLINT) ON CONFLICT DO NOTHING',
    );
    expect(values).toEqual(['p1', 'me', 7]);
    expect(bump).toHaveBeenCalledWith('post', 'p1', 'like_count', 1);
    expect(emit).toHaveBeenCalledWith({
      type: 'post_like',
      recipientId: 'author',
      payload: { postId: 'p1', actorId: 'me' },
      actorBlockChecked: true,
    });
  });

  it('is idempotent: a repeat moves neither the counter nor a notification', async () => {
    const { service, emit, bump } = setup({ inserted: 0 });
    await service.like('me', 'p1');
    expect(bump).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('a like of an own post counts but does not notify', async () => {
    const { service, emit, bump } = setup({ author: 'me' });
    await service.like('me', 'p1');
    expect(bump).toHaveBeenCalledWith('post', 'p1', 'like_count', 1);
    expect(emit).not.toHaveBeenCalled();
  });

  it('refuses when either side blocked the other, before the rate limit', async () => {
    const { service, consume, executeRaw } = setup({ blocked: true });
    await expect(service.like('me', 'p1')).rejects.toMatchObject({
      constructor: ForbiddenException,
      response: { code: ErrorCode.USER_BLOCKED },
    });
    expect(consume).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('404 for a post that is not visible', async () => {
    const { service, executeRaw } = setup({ visible: false });
    await expect(service.like('me', 'p1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('the rate limit still stops a like before the insert', async () => {
    const { service, consume, executeRaw } = setup({});
    consume.mockImplementationOnce(() =>
      Promise.reject(new Error('RATE_LIMITED')),
    );
    await expect(service.like('me', 'p1')).rejects.toThrow('RATE_LIMITED');
    expect(executeRaw).not.toHaveBeenCalled();
  });
});
