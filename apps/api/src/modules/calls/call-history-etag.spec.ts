import type { Request, Response } from 'express';
import { CallHistoryController } from './call-history.controller';
import { CallHistoryService } from './call-history.service';

/** R-385: the first page of GET /calls/history is a 304 from two indexed
 * reads while nothing changed; a new call or «delete» changes the tag. */
function http(ifNoneMatch?: string) {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: jest.fn((k: string, v: string) => {
      headers[k] = v;
    }),
    status: jest.fn(),
  };
  const req = { headers: ifNoneMatch ? { 'if-none-match': ifNoneMatch } : {} };
  return {
    req: req as unknown as Request,
    res: res as unknown as Response,
    status: res.status,
    headers,
  };
}

describe('GET /calls/history cheap ETag (R-385)', () => {
  const user = { sub: 'u1' } as never;
  const build = () => {
    const prisma = {
      call: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'c1',
            status: 'ended',
            ended_at: new Date(1),
            created_at: new Date(1),
          },
        ]),
      },
      callLogHidden: {
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 0 },
          _max: { created_at: null },
        }),
      },
    };
    const svc = new CallHistoryService(prisma as never, {} as never);
    const history = jest
      .spyOn(svc, 'history')
      .mockResolvedValue({ items: [], nextCursor: null });
    return { c: new CallHistoryController(svc), prisma, history };
  };

  it('unchanged first page: 304, the page is not built', async () => {
    const { c, history } = build();
    const first = http();
    await c.callHistory(user, {}, first.req, first.res);
    expect(first.headers.ETag).toMatch(/^W\/"calls-/);
    const again = http(first.headers.ETag);
    expect(await c.callHistory(user, {}, again.req, again.res)).toBeUndefined();
    expect(again.status).toHaveBeenCalledWith(304);
    expect(history).toHaveBeenCalledTimes(1);
  });

  it('a new call or a deleted one changes the tag', async () => {
    const { c, prisma, history } = build();
    const first = http();
    await c.callHistory(user, {}, first.req, first.res);
    prisma.call.findMany.mockResolvedValue([
      {
        id: 'c2',
        status: 'missed',
        ended_at: new Date(2),
        created_at: new Date(2),
      },
    ]);
    const a = http(first.headers.ETag);
    expect(await c.callHistory(user, {}, a.req, a.res)).toBeDefined();
    prisma.callLogHidden.aggregate.mockResolvedValue({
      _count: { _all: 1 },
      _max: { created_at: new Date(3) },
    });
    const b = http(a.headers.ETag);
    expect(await c.callHistory(user, {}, b.req, b.res)).toBeDefined();
    expect(history).toHaveBeenCalledTimes(3);
  });

  it('a next page is never tagged', async () => {
    const { c, prisma } = build();
    const h = http('W/"anything"');
    await c.callHistory(user, { cursor: 'x' }, h.req, h.res);
    expect(prisma.call.findMany).not.toHaveBeenCalled();
    expect(h.headers.ETag).toBeUndefined();
  });
});

describe('call history page: three indexed branches, merged (perf guard 2026-11-08)', () => {
  const row = (id: string, at: number) => ({
    id,
    caller_id: 'u1',
    callee_id: 'p',
    group_id: null,
    is_group: false,
    conversation_id: null,
    status: 'ended',
    video: false,
    created_at: new Date(at),
    duration_sec: 1,
  });

  it('asks caller / callee / group calls apart and merges them newest first', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([row('a', 5), row('b', 3)]) // I called
      .mockResolvedValueOnce([row('c', 4), row('b', 3)]) // I was called (b twice: deduped)
      .mockResolvedValueOnce([row('d', 6)]); // a group call I joined
    const prisma = {
      call: { findMany },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      chatGroup: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const files = { avatarUrlsMany: jest.fn().mockResolvedValue(new Map()) };
    const svc = new CallHistoryService(prisma as never, files as never);
    const page = await svc.history({ sub: 'u1' } as never, undefined, 3);
    expect(page.items.map((i) => i.id)).toEqual(['d', 'a', 'c']);
    expect(page.nextCursor).not.toBeNull();
    const wheres = findMany.mock.calls.map(
      (c: [{ where: Record<string, unknown> }]) => c[0].where,
    );
    expect(wheres[0]).toMatchObject({ caller_id: 'u1' });
    expect(wheres[1]).toMatchObject({ callee_id: 'u1' });
    expect(wheres[2]).toMatchObject({
      is_group: true,
      participants: { some: { user_id: 'u1' } },
    });
    // no branch carries the index-defeating OR of the three
    for (const w of wheres) expect(w).not.toHaveProperty('OR');
  });
});
