import { FollowsService } from './follows.service';

/** S7-1: a blocked (either way) attorney never shows in search results,
 * follow lists or suggestions: `present` is the one place they all pass. */
describe('FollowsService.present hides blocked attorneys', () => {
  function setup(hidden: string[]) {
    const user = (id: string) => ({
      id,
      first_name: 'A',
      last_name: id,
      avatar_file_id: null,
      attorney_profile: {
        username: id,
        verification_status: 'verified',
        trust_level: 1,
        trust_badge: false,
        name_mismatch: false,
        rating_avg: 4,
        rating_count: 1,
        licenses: [],
        practice_areas: [],
      },
    });
    const findMany = jest
      .fn()
      .mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.map(user)),
      );
    const prisma = {
      user: { findMany },
      follow: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const blocks = {
      hiddenIds: jest.fn().mockResolvedValue(new Set(hidden)),
    };
    const files = { avatarUrlsMany: jest.fn().mockResolvedValue(new Map()) };
    const service = new FollowsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      files as never,
      {} as never,
      blocks as never,
      {} as never,
    );
    return { service, findMany, blocks };
  }

  it('drops hidden ids, keeps order of the rest', async () => {
    const { service, findMany } = setup(['b']);
    const out = await service.present(['a', 'b', 'c'], 'viewer');
    expect(out.map((x) => x.id)).toEqual(['a', 'c']);
    expect(findMany.mock.calls[0][0].where.id.in).toEqual(['a', 'c']);
  });

  it('everything hidden: no database read at all', async () => {
    const { service, findMany } = setup(['a']);
    await expect(service.present(['a'], 'viewer')).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
