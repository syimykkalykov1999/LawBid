import { FollowsService } from './follows.service';

/** Owner 2026-10-22 (client economy plan, package D): POST / DELETE
 * …/follow answer {following, followersCount} so the app never re-reads
 * the profile after the tap. */
describe('FollowsService follow state', () => {
  function setup(opts: { inserted: number; deleted: number }) {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          role: 'attorney',
          status: 'active',
          attorney_profile: { verification_status: 'verified' },
        }),
        findUnique: jest.fn().mockResolvedValue({ role: 'attorney' }),
      },
      follow: {
        createMany: jest.fn().mockResolvedValue({ count: opts.inserted }),
        deleteMany: jest.fn().mockResolvedValue({ count: opts.deleted }),
      },
      attorneyProfile: {
        findUnique: jest.fn().mockResolvedValue({ followers_count: 10 }),
      },
      clientProfile: { findUnique: jest.fn() },
    };
    const counters = {
      bump: jest.fn().mockResolvedValue(undefined),
      pending: jest.fn().mockResolvedValue(new Map([['att', 2]])),
    };
    const service = new FollowsService(
      prisma as never,
      { consume: jest.fn() } as never,
      counters as never,
      { emit: jest.fn() } as never,
      {} as never,
      {} as never,
      { assertNotBlocked: jest.fn() } as never,
      {} as never,
    );
    return { service, counters, prisma };
  }
  const me = { sub: 'me', role: 'client' } as never;

  it('follow: stored counter + pending delta, following = true', async () => {
    const { service, counters } = setup({ inserted: 1, deleted: 0 });
    await expect(service.follow(me, 'att')).resolves.toEqual({
      following: true,
      followersCount: 12,
    });
    expect(counters.bump).toHaveBeenCalledWith(
      'attorney',
      'att',
      'followers_count',
      1,
    );
  });

  it('a repeated follow is idempotent and still answers the state', async () => {
    const { service, counters } = setup({ inserted: 0, deleted: 0 });
    await expect(service.follow(me, 'att')).resolves.toEqual({
      following: true,
      followersCount: 12,
    });
    expect(counters.bump).not.toHaveBeenCalled();
  });

  it('unfollow answers following = false', async () => {
    const { service } = setup({ inserted: 0, deleted: 1 });
    await expect(service.unfollow(me, 'att')).resolves.toEqual({
      following: false,
      followersCount: 12,
    });
  });
});
