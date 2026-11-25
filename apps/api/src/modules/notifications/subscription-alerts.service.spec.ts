import {
  SubscriptionAlertsService,
  ALERT_BATCH,
} from './subscription-alerts.service';

/** Audit A-1: followers of a post are read by keyset and written in batches. */
describe('SubscriptionAlertsService.followersOfPost', () => {
  const ids = (from: number, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `00000000-0000-0000-0000-${String(from + i).padStart(12, '0')}`,
    }));

  function setup(pages: { id: string }[][]) {
    const queryRaw = jest.fn();
    for (const p of pages) queryRaw.mockResolvedValueOnce(p);
    const emitMany = jest.fn((a: { recipientIds: string[] }) =>
      Promise.resolve(a.recipientIds.length),
    );
    const svc = new SubscriptionAlertsService(
      { $queryRaw: queryRaw } as never,
      { emitMany } as never,
    );
    return { svc, queryRaw, emitMany };
  }

  it('pages through a big audience and dedupes by post', async () => {
    const first = ids(1, ALERT_BATCH);
    const second = ids(ALERT_BATCH + 1, 7);
    const { svc, queryRaw, emitMany } = setup([first, second]);
    const sent = await svc.followersOfPost('author', 'post-1', true);
    expect(sent).toBe(ALERT_BATCH + 7);
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(emitMany).toHaveBeenCalledTimes(2);
    expect(emitMany.mock.calls[0][0]).toMatchObject({
      type: 'followed_post',
      dedupeKey: 'followed_post:post-1',
      payload: { postId: 'post-1', actorId: 'author', kind: 'brief' },
    });
  });

  it('stops at the first short page and sends nothing for no followers', async () => {
    const a = setup([ids(1, 3)]);
    expect(await a.svc.followersOfPost('x', 'p')).toBe(3);
    expect(a.queryRaw).toHaveBeenCalledTimes(1);
    const b = setup([[]]);
    expect(await b.svc.followersOfPost('x', 'p')).toBe(0);
    expect(b.emitMany).not.toHaveBeenCalled();
  });
});

/** Pack E (25.11, ROUND2 #17): with split reads the follows are paged by
 * keyset too — never every follower in one read. */
describe('SubscriptionAlertsService split reads', () => {
  const uid = (n: number) =>
    `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const prev = process.env.SHARD_SPLIT_READS;
  beforeAll(() => {
    process.env.SHARD_SPLIT_READS = 'on';
  });
  afterAll(() => {
    if (prev === undefined) delete process.env.SHARD_SPLIT_READS;
    else process.env.SHARD_SPLIT_READS = prev;
  });

  function setup(total: number, pushOff: ReadonlySet<string> = new Set()) {
    const all = Array.from({ length: total }, (_, i) => uid(i + 1));
    const findMany = jest.fn(
      (a: { where: { follower_id?: { gt: string } }; take?: number }) => {
        const after = a.where.follower_id?.gt;
        const rest = after ? all.filter((id) => id > after) : all;
        return Promise.resolve(
          rest
            .slice(0, a.take ?? rest.length)
            .map((follower_id) => ({ follower_id })),
        );
      },
    );
    const prisma = {
      follow: { findMany },
      notificationSetting: {
        findMany: jest.fn((a: { where: { user_id: { in: string[] } } }) =>
          Promise.resolve(
            a.where.user_id.in
              .filter((id) => !pushOff.has(id))
              .map((user_id) => ({ user_id })),
          ),
        ),
      },
      user: {
        findMany: jest.fn((a: { where: { id: { in: string[] } } }) =>
          Promise.resolve(a.where.id.in.map((id) => ({ id }))),
        ),
      },
      userBlock: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const emitMany = jest.fn((a: { recipientIds: string[] }) =>
      Promise.resolve(a.recipientIds.length),
    );
    const svc = new SubscriptionAlertsService(
      prisma as never,
      { emitMany } as never,
    );
    return { svc, findMany, emitMany };
  }

  it('reads ALERT_BATCH follows a time and reaches everyone', async () => {
    const { svc, findMany, emitMany } = setup(ALERT_BATCH * 2 + 3);
    expect(await svc.followersOfPost('author', 'post-1')).toBe(
      ALERT_BATCH * 2 + 3,
    );
    expect(findMany).toHaveBeenCalledTimes(3);
    for (const [arg] of findMany.mock.calls) {
      expect(arg).toMatchObject({
        take: ALERT_BATCH,
        orderBy: { follower_id: 'asc' },
      });
    }
    expect(findMany.mock.calls[1][0].where.follower_id).toEqual({
      gt: uid(ALERT_BATCH),
    });
    expect(emitMany).toHaveBeenCalledTimes(3);
  });

  it('a page where nobody has the push on still moves to the next page', async () => {
    const firstPage = new Set(
      Array.from({ length: ALERT_BATCH }, (_, i) => uid(i + 1)),
    );
    const { svc, emitMany } = setup(ALERT_BATCH + 1, firstPage);
    const r = await svc.alertBatch('author', 'p', false, null);
    expect(r).toEqual({ sent: 0, next: uid(ALERT_BATCH) });
    expect(emitMany).not.toHaveBeenCalled();
    expect(await svc.alertBatch('author', 'p', false, r.next)).toEqual({
      sent: 1,
      next: null,
    });
  });
});
