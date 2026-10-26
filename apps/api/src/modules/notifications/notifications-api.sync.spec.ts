import { NotificationsApiService } from './notifications-api.service';

/** Owner 2026-10-22 (client economy plan, package F): the bell's list as
 * a delta, and «mark read» naming the rows it flipped. */
describe('NotificationsApiService deltas', () => {
  const since = new Date('2026-10-22T10:00:00Z');
  const t = (m: number) => new Date(since.getTime() + m * 60_000);
  const row = (id: string, m: number) => ({
    id,
    user_id: 'me',
    type: 'post_like',
    category: 'social',
    payload: {},
    read_at: null,
    created_at: t(m),
    updated_at: t(m),
    dedupe_key: null,
    aggregate_count: 1,
  });

  function setup(rows: unknown[]) {
    const prisma = {
      notification: {
        findMany: jest.fn().mockResolvedValue(rows),
        updateMany: jest.fn().mockResolvedValue({ count: rows.length }),
      },
    };
    const badges = { notificationsChanged: jest.fn() };
    const svc = new NotificationsApiService(
      prisma as never,
      badges as never,
      {} as never,
    );
    jest
      .spyOn(svc as never, 'present' as never)
      .mockImplementation(((rs: { id: string }[]) =>
        Promise.resolve(rs.map((r) => ({ id: r.id })))) as never);
    return { svc, prisma, badges };
  }

  it('updatedSince: rows changed since, newest first, syncedAt = newest stamp', async () => {
    const { svc, prisma } = setup([row('n2', 5), row('n1', 2)]);
    const page = await svc.list(
      'me',
      undefined,
      undefined,
      undefined,
      since.toISOString(),
    );
    expect(page.items.map((n) => n.id)).toEqual(['n2', 'n1']);
    expect(page.deletedIds).toEqual([]);
    expect(page.syncedAt).toBe(t(5).toISOString());
    expect(prisma.notification.findMany.mock.calls[0][0].where).toMatchObject({
      user_id: 'me',
      updated_at: { gte: since },
    });
  });

  it('updatedSince older than 7 days → 409 SYNC_TOO_OLD', async () => {
    const { svc } = setup([]);
    await expect(
      svc.list('me', undefined, undefined, undefined, '2020-01-01T00:00:00Z'),
    ).rejects.toMatchObject({ response: { code: 'SYNC_TOO_OLD' } });
  });

  it('read answers the ids it flipped and recounts the badge once', async () => {
    const { svc, prisma, badges } = setup([{ id: 'n1' }, { id: 'n3' }]);
    await expect(svc.read('me', { ids: ['n1', 'n2', 'n3'] })).resolves.toEqual({
      updated: 2,
      readIds: ['n1', 'n3'],
    });
    expect(prisma.notification.updateMany.mock.calls[0][0].where).toMatchObject(
      { id: { in: ['n1', 'n3'] }, read_at: null },
    );
    expect(badges.notificationsChanged).toHaveBeenCalledTimes(1);
  });

  it('read with nothing unread: 0, [] and no badge work', async () => {
    const { svc, prisma, badges } = setup([]);
    await expect(svc.read('me', { all: true })).resolves.toEqual({
      updated: 0,
      readIds: [],
    });
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
    expect(badges.notificationsChanged).not.toHaveBeenCalled();
  });
});
