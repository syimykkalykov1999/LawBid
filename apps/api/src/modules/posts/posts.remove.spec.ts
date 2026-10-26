import { PostsService } from './posts.service';

// Owner 2026-10-26: the profile counter drops even when the video purge of
// a deleted reel fails (it used to stay wrong forever).
describe('PostsService.remove counter', () => {
  it('decrements posts_count before the video purge, so a purge error cannot leave it stale', async () => {
    const bump = jest.fn(() => Promise.resolve());
    const prisma = {
      post: {
        updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
        // soft-deleted rows are hidden unless the lookup asks for them
        findFirst: jest.fn(({ where }: { where: { deleted_at?: unknown } }) =>
          Promise.resolve(
            !where.deleted_at
              ? null
              : {
                  status: 'published',
                  video_asset_id: 'v1',
                  archived_at: null,
                },
          ),
        ),
      },
      videoAsset: { findUnique: jest.fn(() => Promise.resolve({ id: 'v1' })) },
    };
    const svc = Object.create(PostsService.prototype) as PostsService;
    Object.assign(svc, {
      prisma,
      counters: { bump },
      videos: {
        markDeleted: jest.fn(() => Promise.resolve()),
        purgeNow: jest.fn(() => Promise.reject(new Error('s3 down'))),
      },
    });
    await expect(
      svc.remove({ sub: 'u1', role: 'attorney' } as never, 'p1'),
    ).rejects.toThrow('s3 down');
    expect(bump).toHaveBeenCalledWith('attorney', 'u1', 'posts_count', -1);
  });
});
