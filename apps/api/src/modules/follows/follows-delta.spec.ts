import { FollowsService } from './follows.service';

/**
 * B-c7 (2026-11-09): unfollow writes a tombstone, a follow again removes
 * it, and GET /users/me/following?updatedSince answers the people followed
 * since plus meta.deletedIds from the tombstones — the phone never reloads
 * the whole list.
 */
const T = (ms: number) => new Date(Date.UTC(2026, 10, 9, 8, 0, 0, ms));

function setup(
  opts: {
    added?: Array<{ followee_id: string; created_at: Date }>;
    gone?: Array<{ followee_id: string; unfollowed_at: Date }>;
  } = {},
) {
  const prisma = {
    user: {
      findFirst: jest.fn().mockResolvedValue({
        role: 'attorney',
        status: 'active',
        attorney_profile: { verification_status: 'verified' },
      }),
      findUnique: jest.fn().mockResolvedValue({ role: 'attorney' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    follow: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue(opts.added ?? []),
    },
    followTombstone: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue(opts.gone ?? []),
    },
    attorneyProfile: {
      findUnique: jest.fn().mockResolvedValue({ followers_count: 10 }),
    },
    clientProfile: { findUnique: jest.fn() },
  };
  const service = new FollowsService(
    prisma as never,
    { consume: jest.fn() } as never,
    {
      bump: jest.fn(),
      pending: jest.fn().mockResolvedValue(new Map()),
    } as never,
    { emit: jest.fn() } as never,
    {} as never,
    {} as never,
    {
      assertNotBlocked: jest.fn(),
      hiddenIds: jest.fn().mockResolvedValue(new Set()),
    } as never,
    {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      incr: jest.fn(),
    } as never,
  );
  return { service, prisma };
}
const me = { sub: 'me', role: 'client' } as never;

describe('follow tombstones (B-c7)', () => {
  it('unfollow writes the tombstone with its time', async () => {
    const { service, prisma } = setup();
    await service.unfollow(me, 'att');
    expect(prisma.followTombstone.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          follower_id_followee_id: { follower_id: 'me', followee_id: 'att' },
        },
        create: expect.objectContaining({
          follower_id: 'me',
          followee_id: 'att',
        }),
      }),
    );
  });

  it('a follow again removes the tombstone', async () => {
    const { service, prisma } = setup();
    await service.follow(me, 'att');
    expect(prisma.followTombstone.deleteMany).toHaveBeenCalledWith({
      where: { follower_id: 'me', followee_id: 'att' },
    });
  });

  it('an unfollow that removed nothing writes no tombstone', async () => {
    const { service, prisma } = setup();
    prisma.follow.deleteMany.mockResolvedValue({ count: 0 });
    await service.unfollow(me, 'att');
    expect(prisma.followTombstone.upsert).not.toHaveBeenCalled();
  });
});

describe('GET /users/me/following?updatedSince (B-c7)', () => {
  it('answers the new follows, the unfollowed ids and the newest stamp', async () => {
    const since = T(0);
    const { service, prisma } = setup({
      added: [{ followee_id: 'a2', created_at: T(300) }],
      gone: [{ followee_id: 'a1', unfollowed_at: T(700) }],
    });
    const present = jest.spyOn(service, 'present').mockResolvedValue([]);
    const page = await service.mineChanged('me', since.toISOString());
    expect(present).toHaveBeenCalledWith(['a2'], 'me');
    expect(page.deletedIds).toEqual(['a1']);
    expect(page.syncedAt).toBe(T(700).toISOString());
    expect(page.nextCursor).toBeNull();
    expect(prisma.follow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          follower_id: 'me',
          created_at: { gte: since },
        }),
      }),
    );
    expect(prisma.followTombstone.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { follower_id: 'me', unfollowed_at: { gte: since } },
      }),
    );
  });

  it('unfollowed then followed again inside the gap: the row wins, no tombstone id', async () => {
    const since = T(0);
    const { service } = setup({
      added: [{ followee_id: 'a1', created_at: T(900) }],
      gone: [{ followee_id: 'a1', unfollowed_at: T(400) }],
    });
    jest.spyOn(service, 'present').mockResolvedValue([]);
    const page = await service.mineChanged('me', since.toISOString());
    expect(page.deletedIds).toEqual([]);
    expect(page.syncedAt).toBe(T(900).toISOString());
  });

  it('nothing changed: empty lists, syncedAt = the time passed in', async () => {
    const since = T(0);
    const { service } = setup();
    expect(await service.mineChanged('me', since.toISOString())).toEqual({
      items: [],
      nextCursor: null,
      deletedIds: [],
      syncedAt: since.toISOString(),
    });
  });

  it('older than 7 days → 409 SYNC_TOO_OLD', async () => {
    const { service } = setup();
    const old = new Date(Date.now() - 8 * 86_400_000).toISOString();
    await expect(service.mineChanged('me', old)).rejects.toMatchObject({
      status: 409,
    });
  });
});
