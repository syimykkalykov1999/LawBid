import { NotificationsApiService } from './notifications-api.service';

/**
 * Verify batch 8 (17.11), NO1 / NO4 / NO2 — a small in-memory notifications
 * table, so the spec checks what ends up read, not which Prisma call did it.
 *
 * NO1: «Прочитать все» read at most 1000 rows (`take: 1000`).
 * NO4: a like re-opened while the call ran (its row moved after the moment
 *      of the request) was marked read with the rest.
 * NO2: a delta of more than 500 changed rows sent 500 and moved `syncedAt`
 *      past the rest; it is now `409 SYNC_TOO_OLD` (reload), as Telegram's
 *      `updates.differenceTooLong`.
 */
type Row = {
  id: string;
  user_id: string;
  type: string;
  category: string;
  payload: object;
  read_at: Date | null;
  created_at: Date;
  updated_at: Date;
  dedupe_key: null;
  aggregate_count: number;
};

type Where = {
  user_id?: string;
  read_at?: null;
  id?: { in: string[] };
  updated_at?: { lte?: Date; gte?: Date };
};

function matches(r: Row, w: Where): boolean {
  if (w.user_id !== undefined && r.user_id !== w.user_id) return false;
  if ('read_at' in w && w.read_at === null && r.read_at !== null) return false;
  if (w.id && !w.id.in.includes(r.id)) return false;
  if (w.updated_at?.lte && r.updated_at > w.updated_at.lte) return false;
  if (w.updated_at?.gte && r.updated_at < w.updated_at.gte) return false;
  return true;
}

function table(rows: Row[]) {
  const update = (where: Where, data: { read_at: Date }) => {
    const hit = rows.filter((r) => matches(r, where));
    for (const r of hit) {
      r.read_at = data.read_at;
      r.updated_at = new Date();
    }
    return hit;
  };
  return {
    findMany: jest.fn(({ where, take }: { where: Where; take?: number }) =>
      Promise.resolve(
        rows.filter((r) => matches(r, where)).slice(0, take ?? rows.length),
      ),
    ),
    updateMany: jest.fn(
      ({ where, data }: { where: Where; data: { read_at: Date } }) =>
        Promise.resolve({ count: update(where, data).length }),
    ),
    updateManyAndReturn: jest.fn(
      ({ where, data }: { where: Where; data: { read_at: Date } }) =>
        Promise.resolve(update(where, data).map((r) => ({ id: r.id }))),
    ),
  };
}

function row(id: string, at: Date): Row {
  return {
    id,
    user_id: 'me',
    type: 'post_like',
    category: 'social',
    payload: {},
    read_at: null,
    created_at: at,
    updated_at: at,
    dedupe_key: null,
    aggregate_count: 1,
  };
}

function setup(rows: Row[]) {
  const notification = table(rows);
  const badges = { notificationsChanged: jest.fn() };
  const svc = new NotificationsApiService(
    { notification } as never,
    badges as never,
    {} as never,
  );
  jest
    .spyOn(svc as never, 'present' as never)
    .mockImplementation(((rs: { id: string }[]) =>
      Promise.resolve(rs.map((r) => ({ id: r.id })))) as never);
  return { svc, notification, badges };
}

describe('NotificationsApiService «read all» and the delta cap', () => {
  const NOW = new Date('2026-11-17T12:00:00Z');
  beforeEach(() =>
    jest.useFakeTimers({
      now: NOW,
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    }),
  );
  afterEach(() => jest.useRealTimers());

  it('NO1: «read all» reads every unread row, not only 1000', async () => {
    const before = new Date(NOW.getTime() - 60_000);
    const rows = Array.from({ length: 1500 }, (_, i) => row(`n${i}`, before));
    const { svc, badges } = setup(rows);
    const res = await svc.read('me', { all: true });
    expect(rows.filter((r) => r.read_at === null)).toHaveLength(0);
    expect(res.updated).toBe(1500);
    expect(res.readIds).toHaveLength(1500);
    expect(badges.notificationsChanged).toHaveBeenCalledTimes(1);
  });

  it('NO4: a row that moved after the moment of the request stays unread', async () => {
    const before = new Date(NOW.getTime() - 60_000);
    // Re-opened by a new like while «read all» was on its way.
    const reopened = row('late', new Date(NOW.getTime() + 5_000));
    const rows = [row('old', before), reopened];
    const { svc } = setup(rows);
    const res = await svc.read('me', { all: true });
    expect(res).toEqual({ updated: 1, readIds: ['old'] });
    expect(reopened.read_at).toBeNull();
  });

  it('NO2: a delta of more than 500 changed rows is 409 SYNC_TOO_OLD (reload)', async () => {
    const since = new Date(NOW.getTime() - 3_600_000);
    const same = new Date(NOW.getTime() - 60_000);
    const rows = Array.from({ length: 600 }, (_, i) => row(`d${i}`, same));
    const { svc } = setup(rows);
    await expect(
      svc.list('me', undefined, undefined, undefined, since.toISOString()),
    ).rejects.toMatchObject({ response: { code: 'SYNC_TOO_OLD' } });
  });

  it('NO2: a delta of exactly 500 rows is still answered whole', async () => {
    const since = new Date(NOW.getTime() - 3_600_000);
    const same = new Date(NOW.getTime() - 60_000);
    const rows = Array.from({ length: 500 }, (_, i) => row(`d${i}`, same));
    const { svc } = setup(rows);
    const page = await svc.list(
      'me',
      undefined,
      undefined,
      undefined,
      since.toISOString(),
    );
    expect(page.items).toHaveLength(500);
    expect(page.syncedAt).toBe(same.toISOString());
  });
});
