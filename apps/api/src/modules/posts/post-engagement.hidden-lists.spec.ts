import { PostEngagementService } from './post-engagement.service';

/** Owner 16.11 (Instagram «Hide like and share counts»): while the author
 * hides the counters, who liked and who reposted is empty for everyone —
 * the author too; «Показать» brings both lists back. */
describe('PostEngagementService hidden likers / reposters', () => {
  function setup(hideLikes: boolean) {
    const likes = jest.fn().mockResolvedValue([]);
    const reposts = jest.fn().mockResolvedValue([]);
    const prisma = {
      post: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'p1',
          author_id: 'author',
          hide_likes: hideLikes,
          shard_id: 0,
        }),
      },
      userBlock: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      postLike: { findMany: likes },
      postRepost: { findMany: reposts },
    };
    const follows = { peopleByIds: jest.fn().mockResolvedValue([]) };
    const service = new PostEngagementService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      follows as never,
      {} as never,
    );
    return { service, likes, reposts };
  }

  it.each(['author', 'viewer'])(
    'hidden: %s gets empty lists, nothing is read',
    async (who) => {
      const { service, likes, reposts } = setup(true);
      await expect(service.listLikers(who, 'p1', undefined)).resolves.toEqual({
        items: [],
        nextCursor: null,
      });
      await expect(
        service.listReposters(who, 'p1', undefined),
      ).resolves.toEqual({ items: [], nextCursor: null });
      expect(likes).not.toHaveBeenCalled();
      expect(reposts).not.toHaveBeenCalled();
    },
  );

  it.each(['author', 'viewer'])('shown: %s gets the lists', async (who) => {
    const { service, likes, reposts } = setup(false);
    await service.listLikers(who, 'p1', undefined);
    await service.listReposters(who, 'p1', undefined);
    expect(likes).toHaveBeenCalledTimes(1);
    expect(reposts).toHaveBeenCalledTimes(1);
  });
});
