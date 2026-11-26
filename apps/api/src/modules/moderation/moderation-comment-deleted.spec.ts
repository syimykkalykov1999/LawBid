/* eslint-disable @typescript-eslint/require-await -- hand-made Prisma fakes */
import { AdminContentBulkService } from '../admin-content/admin-content-bulk.service';
import { AdminContentService } from '../admin-content/admin-content.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ModerationService, type ModerationTarget } from './moderation.service';

const order: string[] = [];

jest.mock('../../prisma/tx-retry.util', () => ({
  withTxRetry: async (_p: unknown, fn: (tx: unknown) => unknown) => {
    const out = await fn(txMock);
    order.push('commit');
    return out;
  },
}));

const comment = {
  author_id: 'author',
  body: 'x',
  status: 'published',
  deleted_at: null,
  created_at: new Date(),
  post_id: 'p1',
  parent_comment_id: null as string | null,
};
const txMock = {
  comment: {
    findUnique: jest.fn(async () => comment),
    update: jest.fn(async () => ({})),
  },
};

/**
 * Foreman re-check 25.11 (item 5): a comment a moderator or an admin hides
 * or removes used to stay on every open post until it was reopened — only
 * the author's own delete sent `comment:deleted`. Now the moderation status
 * path sends the same event to room `post:{id}`, after the commit.
 */
describe('moderation take-down of a comment sends comment:deleted', () => {
  let realtime: { toRoom: jest.Mock };
  let moderation: ModerationService;

  beforeEach(() => {
    order.length = 0;
    comment.status = 'published';
    comment.parent_comment_id = null;
    realtime = {
      toRoom: jest.fn(() => {
        order.push('emit');
      }),
    };
    moderation = new ModerationService(
      {} as never,
      { bump: jest.fn(async () => undefined) } as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      // The real relay (NotificationsService.commentRemoved) over a fake
      // socket publisher.
      Object.assign(Object.create(NotificationsService.prototype) as object, {
        realtime,
      }) as never,
    );
  });

  const target = (over: Partial<ModerationTarget> = {}): ModerationTarget => ({
    type: 'comment',
    id: 'c1',
    authorId: 'author',
    status: 'published',
    text: 'x',
    context: { postId: 'p1', parentCommentId: null },
    createdAt: new Date(),
    ...over,
  });

  it('a hidden top comment: the room hears it once the after-steps run', async () => {
    const after: (() => Promise<void>)[] = [];
    await moderation.setContentStatus(txMock as never, target(), 'hide', after);
    expect(realtime.toRoom).not.toHaveBeenCalled();
    for (const f of after) await f();
    expect(realtime.toRoom).toHaveBeenCalledWith('post:p1', 'comment:deleted', {
      postId: 'p1',
      commentId: 'c1',
      parentCommentId: null,
      removed: 1,
    });
  });

  it('a removed reply names its parent', async () => {
    const after: (() => Promise<void>)[] = [];
    await moderation.setContentStatus(
      txMock as never,
      target({ context: { postId: 'p1', parentCommentId: 'c0' } }),
      'remove',
      after,
    );
    for (const f of after) await f();
    expect(realtime.toRoom).toHaveBeenCalledWith('post:p1', 'comment:deleted', {
      postId: 'p1',
      commentId: 'c1',
      parentCommentId: 'c0',
      removed: 1,
    });
  });

  it('nothing for a comment nobody saw, or for a restore', async () => {
    const after: (() => Promise<void>)[] = [];
    await moderation.setContentStatus(
      txMock as never,
      target({ status: 'hidden' }),
      'remove',
      after,
    );
    await moderation.setContentStatus(
      txMock as never,
      target({ status: 'hidden' }),
      'restore',
      after,
    );
    for (const f of after) await f();
    expect(realtime.toRoom).not.toHaveBeenCalled();
  });

  it('admin «remove comment»: the event goes after the commit', async () => {
    const svc = Object.create(
      AdminContentService.prototype,
    ) as AdminContentService;
    Object.assign(svc, {
      prisma: {},
      moderation,
      notifications: { emit: jest.fn(async () => undefined) },
    });
    jest
      .spyOn(
        svc as unknown as { tellAuthor: () => Promise<void> },
        'tellAuthor',
      )
      .mockResolvedValue(undefined);
    await svc.removeComment('c1', 'post', 'reason!!');
    expect(order).toEqual(['commit', 'emit']);
    expect(realtime.toRoom).toHaveBeenCalledWith(
      'post:p1',
      'comment:deleted',
      expect.objectContaining({ commentId: 'c1', removed: 1 }),
    );
  });

  it('admin bulk hide: the event goes after the commit', async () => {
    const svc = Object.create(
      AdminContentBulkService.prototype,
    ) as AdminContentBulkService;
    Object.assign(svc, {
      prisma: {},
      moderation,
      notifications: { emit: jest.fn(async () => undefined) },
    });
    await (
      svc as unknown as {
        one: (
          admin: unknown,
          action: string,
          type: string,
          id: string,
          reason: string,
        ) => Promise<void>;
      }
    ).one({ id: 'a' }, 'hide', 'comment', 'c1', 'reason!!');
    expect(order).toEqual(['commit', 'emit']);
  });
});
