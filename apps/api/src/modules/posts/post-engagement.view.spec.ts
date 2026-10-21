import { PostEngagementService } from './post-engagement.service';
import { PostEventsService } from './post-events.service';

/** Owner 2026-10-12: a view of a video post / reel, never the author's own.
 * Owner 2026-10-18: once per viewer per 24 h through PostEventsService. */
describe('PostEngagementService views', () => {
  function setup(opts: { author?: string; visible?: boolean }) {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const record = jest.fn().mockResolvedValue(true);
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
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { record } as never,
    );
    return { service, createMany, record };
  }

  it('records a view event and keeps the seen row', async () => {
    const { service, createMany, record } = setup({});
    await service.view('me', 'p1');
    expect(createMany).toHaveBeenCalledWith({
      data: [{ post_id: 'p1', user_id: 'me' }],
      skipDuplicates: true,
    });
    expect(record).toHaveBeenCalledWith({
      postId: 'p1',
      authorId: 'author',
      viewerId: 'me',
      kind: 'view',
    });
  });

  it("the author's own view is not counted", async () => {
    const { service, createMany, record } = setup({ author: 'me' });
    await service.view('me', 'p1');
    expect(createMany).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('a hidden or deleted post is POST_NOT_FOUND', async () => {
    const { service } = setup({ visible: false });
    await expect(service.view('me', 'p1')).rejects.toMatchObject({
      response: { code: 'POST_NOT_FOUND' },
    });
  });
});

describe('PostEventsService', () => {
  function setup(inserted: number) {
    const executeRaw = jest.fn().mockResolvedValue(inserted);
    const tx = { $executeRaw: executeRaw };
    const create = jest.fn().mockResolvedValue({});
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      postViewEvent: { create },
    };
    const bump = jest.fn().mockResolvedValue(undefined);
    const service = new PostEventsService(prisma as never, { bump } as never);
    return { service, executeRaw, create, bump };
  }

  it('a new view in 24 h moves view_count', async () => {
    const { service, bump } = setup(1);
    await expect(
      service.record({
        postId: 'p1',
        authorId: 'a',
        viewerId: 'v',
        kind: 'view',
      }),
    ).resolves.toBe(true);
    expect(bump).toHaveBeenCalledWith('post', 'p1', 'view_count', 1);
  });

  it('a repeat within 24 h adds nothing', async () => {
    const { service, bump } = setup(0);
    await expect(
      service.record({
        postId: 'p1',
        authorId: 'a',
        viewerId: 'v',
        kind: 'view',
      }),
    ).resolves.toBe(false);
    expect(bump).not.toHaveBeenCalled();
  });

  it("never the author's own; other kinds leave view_count alone", async () => {
    const { service, executeRaw, bump } = setup(1);
    await expect(
      service.record({
        postId: 'p1',
        authorId: 'a',
        viewerId: 'a',
        kind: 'view',
      }),
    ).resolves.toBe(false);
    expect(executeRaw).not.toHaveBeenCalled();
    await service.record({
      postId: 'p1',
      authorId: 'a',
      viewerId: 'v',
      kind: 'impression',
    });
    expect(bump).not.toHaveBeenCalled();
  });

  it('an anonymous event is always written', async () => {
    const { service, create } = setup(0);
    await expect(
      service.record({
        postId: 'p1',
        authorId: 'a',
        viewerId: null,
        kind: 'impression',
      }),
    ).resolves.toBe(true);
    expect(create).toHaveBeenCalledWith({
      data: { post_id: 'p1', viewer_id: null, kind: 'impression' },
    });
  });
});

/** Owner 2026-10-20: one share per user and post per 24 h counts. */
describe('PostEngagementService share dedup', () => {
  function setup(existing: boolean) {
    const create = jest.fn().mockResolvedValue({});
    const bump = jest.fn().mockResolvedValue(undefined);
    const consume = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      post: {
        findFirst: jest.fn().mockResolvedValue({ id: 'p1', author_id: 'a' }),
      },
      postShare: {
        findFirst: jest
          .fn()
          .mockResolvedValue(existing ? { post_id: 'p1' } : null),
        create,
      },
    };
    const service = new PostEngagementService(
      prisma as never,
      { consume } as never,
      { bump } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, create, bump };
  }

  it('a first share in 24 h counts', async () => {
    const { service, create, bump } = setup(false);
    await service.share('me', 'p1');
    expect(create).toHaveBeenCalled();
    expect(bump).toHaveBeenCalledWith('post', 'p1', 'share_count', 1);
  });

  it('a repeat within 24 h adds nothing', async () => {
    const { service, create, bump } = setup(true);
    await service.share('me', 'p1');
    expect(create).not.toHaveBeenCalled();
    expect(bump).not.toHaveBeenCalled();
  });
});
