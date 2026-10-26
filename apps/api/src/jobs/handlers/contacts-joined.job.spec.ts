import { ContactsJoinedJob } from './contacts-joined.job';
import { ContactsPepper } from '../../modules/contacts-sync/contacts-pepper';

/**
 * Owner 2026-10-22: "X joined LawBid" comes from the server, once per
 * (book owner, joiner), only while the owner's «Уведомлять, когда контакты
 * появятся в LawBid» is on.
 */
function make(
  over: {
    joiners?: { id: string; phone_sha256: string }[];
    owners?: string[];
    blocks?: { blocker_id: string; blocked_id: string }[];
    existing?: string[];
    notifyOn?: string[];
  } = {},
) {
  const prisma = {
    user: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          over.joiners ?? [{ id: 'new', phone_sha256: 'h'.repeat(64) }],
        ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    contactBookHash: {
      findMany: jest.fn().mockResolvedValue(
        (over.owners ?? ['o1', 'o2', 'o3', 'o4']).map((o) => ({
          owner_id: o,
        })),
      ),
    },
    userBlock: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          over.blocks ?? [{ blocker_id: 'o3', blocked_id: 'new' }],
        ),
    },
    contactMatch: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          (over.existing ?? ['o4']).map((o) => ({ owner_id: o })),
        ),
      createMany: jest.fn((a: unknown) => ({ op: 'createMany', a })),
    },
    contactSyncSetting: {
      updateMany: jest.fn((a: unknown) => ({ op: 'updateMany', a })),
      findMany: jest.fn((a: { where: { user_id: { in: string[] } } }) =>
        Promise.resolve(
          a.where.user_id.in
            .filter((u) => (over.notifyOn ?? ['o1']).includes(u))
            .map((u) => ({ user_id: u })),
        ),
      ),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const claims = new Set<string>();
  const redis = {
    set: jest.fn((key: string) => {
      if (claims.has(key)) return Promise.resolve(null);
      claims.add(key);
      return Promise.resolve('OK');
    }),
    del: jest.fn().mockResolvedValue(1),
  };
  const notifications = { emit: jest.fn().mockResolvedValue({ id: 'n1' }) };
  const job = new ContactsJoinedJob(
    prisma as never,
    notifications as never,
    redis as never,
    new ContactsPepper({ get: () => undefined } as never),
  );
  return { job, prisma, notifications, redis };
}

describe('ContactsJoinedJob', () => {
  it('matches the new person with every book that has the number; notifies only who asked', async () => {
    const { job, prisma, notifications } = make();
    const now = new Date('2026-10-22T12:00:00Z');
    const out = await job.run(now);
    expect(out).toEqual({ joiners: 1, matched: 2, notified: 1 });
    // only findable, not yet announced people
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.contacts_announced_at).toBeNull();
    expect(where.OR).toEqual([
      { role: 'attorney' },
      { role: 'client', find_by_phone: true },
    ]);
    // looked up by the hash, never a number
    expect(prisma.contactBookHash.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ phone_hash: { in: ['h'.repeat(64)] } }],
          owner_id: { not: 'new' },
        },
      }),
    );
    // o3 blocked them, o4 already had them: only o1 and o2 get the match
    expect(prisma.contactMatch.createMany).toHaveBeenCalledWith({
      data: [
        { owner_id: 'o1', matched_id: 'new' },
        { owner_id: 'o2', matched_id: 'new' },
      ],
      skipDuplicates: true,
    });
    // their apps' daily check fetches the new list
    expect(prisma.contactSyncSetting.updateMany).toHaveBeenCalledWith({
      where: { user_id: { in: ['o1', 'o2'] } },
      data: { matches_version: { increment: 1 } },
    });
    // the switch: only o1 has «notify me» on
    expect(prisma.contactSyncSetting.findMany).toHaveBeenCalledWith({
      where: {
        user_id: { in: ['o1', 'o2'] },
        enabled: true,
        notify_joined: true,
      },
      select: { user_id: true },
    });
    expect(notifications.emit).toHaveBeenCalledTimes(1);
    expect(notifications.emit).toHaveBeenCalledWith({
      type: 'contact_joined',
      recipientId: 'o1',
      payload: { actorId: 'new' },
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['new'] } },
      data: { contacts_announced_at: now },
    });
  });

  it('one notice per joiner per user, even if they are matched again', async () => {
    const { job, notifications } = make({ existing: [], blocks: [] });
    await job.run();
    await job.run();
    expect(
      notifications.emit.mock.calls.filter(
        (c: { recipientId: string }[]) => c[0].recipientId === 'o1',
      ),
    ).toHaveLength(1);
  });

  it('switch off for everyone → matches, but no notice', async () => {
    const { job, notifications, prisma } = make({ notifyOn: [] });
    const out = await job.run();
    expect(out.notified).toBe(0);
    expect(notifications.emit).not.toHaveBeenCalled();
    expect(prisma.contactMatch.createMany).toHaveBeenCalled();
  });

  it('nobody has the number: marked announced, nothing else', async () => {
    const { job, prisma, notifications } = make({ owners: [] });
    const out = await job.run();
    expect(out).toEqual({ joiners: 1, matched: 0, notified: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(notifications.emit).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).toHaveBeenCalled();
  });

  it('no new people: one query, no writes', async () => {
    const { job, prisma } = make({ joiners: [] });
    expect(await job.run()).toEqual({ joiners: 0, matched: 0, notified: 0 });
    expect(prisma.contactBookHash.findMany).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});
