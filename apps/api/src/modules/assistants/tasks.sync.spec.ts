import { HttpException } from '@nestjs/common';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { TasksService } from './tasks.service';

/** Owner 2026-10-22 (delta audit D-P3, Telegram): GET /assistants/tasks
 * with ?updatedSince answers only what changed in the view, plus the ids
 * that left it, plus the time to pass back. */
describe('TasksService delta (updatedSince)', () => {
  const since = new Date(Date.now() - 3_600_000);
  const at = (m: number) => new Date(since.getTime() + m * 60_000);
  const user = { sub: 'atty-1', role: 'attorney' } as RequestUser;

  const row = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    status: 'open',
    archived_at: null,
    updated_at: at(1),
    ...over,
  });

  function setup(rows: unknown[]) {
    const findMany = jest.fn().mockResolvedValue(rows);
    const prisma = { attorneyTask: { findMany } };
    const service = new TasksService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest
      .spyOn(service as unknown as { present: () => unknown }, 'present')
      .mockImplementation(((r: { id: string }[]) =>
        Promise.resolve(r.map((x) => ({ id: x.id })))) as never);
    return { service, findMany };
  }

  it('without updatedSince it is the plain list (an array, view filter in SQL)', async () => {
    const { service, findMany } = setup([row('t1')]);
    const out = await service.list(user, {});
    expect(Array.isArray(out)).toBe(true);
    const where = JSON.stringify(findMany.mock.calls[0][0].where);
    expect(where).not.toContain('updated_at');
    expect(where).toContain('archived_at');
  });

  it('reads only rows changed since, in one query', async () => {
    const { service, findMany } = setup([]);
    await service.list(user, { updatedSince: since.toISOString() });
    expect(findMany).toHaveBeenCalledTimes(1);
    const where = JSON.stringify(findMany.mock.calls[0][0].where);
    expect(where).toContain('updated_at');
    expect(where).toContain(since.toISOString());
  });

  it('nothing changed: empty items, syncedAt stays at since', async () => {
    const { service } = setup([]);
    const out = await service.list(user, { updatedSince: since.toISOString() });
    expect(out).toEqual({
      items: [],
      nextCursor: null,
      deletedIds: [],
      syncedAt: since.toISOString(),
    });
  });

  it('active view: changed open tasks come back, finished / archived ones are ids', async () => {
    const { service } = setup([
      row('open', { updated_at: at(2) }),
      row('done', { status: 'done', updated_at: at(5) }),
      row('shelved', { archived_at: at(3), updated_at: at(3) }),
    ]);
    const out = await service.list(user, {
      updatedSince: since.toISOString(),
      view: 'active',
    });
    expect(out).toMatchObject({
      items: [{ id: 'open' }],
      deletedIds: ['done', 'shelved'],
      syncedAt: at(5).toISOString(),
    });
  });

  it('archive view: the finished ones come back, a reopened one is an id', async () => {
    const { service } = setup([
      row('done', { status: 'done' }),
      row('reopened', { status: 'open' }),
    ]);
    const out = await service.list(user, {
      updatedSince: since.toISOString(),
      view: 'archive',
    });
    expect(out).toMatchObject({
      items: [{ id: 'done' }],
      deletedIds: ['reopened'],
    });
  });

  it('a gap older than 7 days is 409 SYNC_TOO_OLD, an unparsable value 400', async () => {
    const { service } = setup([]);
    const old = new Date(Date.now() - 8 * 86_400_000).toISOString();
    await expect(
      service.list(user, { updatedSince: old }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.list(user, { updatedSince: 'nope' }),
    ).rejects.toBeInstanceOf(HttpException);
  });
});
