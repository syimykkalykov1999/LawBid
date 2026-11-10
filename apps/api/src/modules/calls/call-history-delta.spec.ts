import type { Request, Response } from 'express';
import { CallHistoryController } from './call-history.controller';
import { CallHistoryService } from './call-history.service';

/**
 * B-c7 (2026-11-09): GET /calls/history?updatedSince — the calls that
 * reached or changed on my list since, plus the ids I deleted from it
 * (tombstones = call_log_hidden rows with their time), as /groups does.
 */
const user = { sub: 'me' } as never;
const T = (ms: number) => new Date(Date.UTC(2026, 10, 9, 8, 0, 0, ms));

function build(opts: {
  calls?: Array<Record<string, unknown>>;
  hidden?: Array<{ call_id: string; created_at: Date }>;
}) {
  const call = {
    findMany: jest.fn().mockImplementation(({ where }: { where: never }) =>
      // One branch (caller / callee / group) returns the rows; the others
      // nothing, as a real split query would for a two-person call.
      Promise.resolve(
        (where as { caller_id?: string }).caller_id === 'me'
          ? (opts.calls ?? [])
          : [],
      ),
    ),
  };
  const prisma = {
    call,
    callLogHidden: {
      findMany: jest.fn().mockResolvedValue(opts.hidden ?? []),
      aggregate: jest.fn(),
    },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    chatGroup: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const files = { avatarUrlsMany: jest.fn().mockResolvedValue(new Map()) };
  const svc = new CallHistoryService(prisma as never, files as never);
  return { svc, prisma, c: new CallHistoryController(svc) };
}

const ended = (id: string, updated: Date) => ({
  id,
  status: 'ended',
  caller_id: 'me',
  callee_id: 'peer',
  video: false,
  conversation_id: null,
  group_id: null,
  is_group: false,
  created_at: updated,
  updated_at: updated,
  duration_sec: 12,
});

describe('GET /calls/history?updatedSince (B-c7)', () => {
  it('answers the changed calls, the deleted ids and the newest stamp', async () => {
    const since = T(0);
    const { svc, prisma } = build({
      calls: [ended('c2', T(500))],
      hidden: [{ call_id: 'c1', created_at: T(900) }],
    });
    const page = await svc.changed(user, since.toISOString());
    expect(page.items.map((i) => i.id)).toEqual(['c2']);
    expect(page.deletedIds).toEqual(['c1']);
    expect(page.syncedAt).toBe(T(900).toISOString());
    expect(page.nextCursor).toBeNull();
    // Only rows changed since are asked for, and only my tombstones since.
    expect(prisma.call.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ updated_at: { gte: since } }),
      }),
    );
    expect(prisma.callLogHidden.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 'me', created_at: { gte: since } },
      }),
    );
  });

  it('nothing changed: empty lists and syncedAt = the time passed in', async () => {
    const since = T(0);
    const { svc } = build({});
    const page = await svc.changed(user, since.toISOString());
    expect(page).toEqual({
      items: [],
      nextCursor: null,
      deletedIds: [],
      syncedAt: since.toISOString(),
    });
  });

  it('a gap older than 7 days is 409 SYNC_TOO_OLD (the app reloads the first page)', async () => {
    const { svc } = build({});
    const old = new Date(Date.now() - 8 * 86_400_000).toISOString();
    await expect(svc.changed(user, old)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('the controller takes the delta path and skips the cheap tag', async () => {
    const { c, svc } = build({});
    const changed = jest
      .spyOn(svc, 'changed')
      .mockResolvedValue({ items: [], nextCursor: null, deletedIds: [] });
    const tag = jest.spyOn(svc, 'firstPageTag');
    const res = { setHeader: jest.fn(), status: jest.fn() };
    const since = T(0).toISOString();
    await c.callHistory(
      user,
      { updatedSince: since },
      { headers: {} } as unknown as Request,
      res as unknown as Response,
    );
    expect(changed).toHaveBeenCalledWith(user, since);
    expect(tag).not.toHaveBeenCalled();
  });
});
