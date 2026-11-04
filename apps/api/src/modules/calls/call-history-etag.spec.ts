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
        findFirst: jest.fn().mockResolvedValue({
          id: 'c1',
          status: 'ended',
          ended_at: new Date(1),
        }),
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
    prisma.call.findFirst.mockResolvedValue({
      id: 'c2',
      status: 'missed',
      ended_at: new Date(2),
    });
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
    expect(prisma.call.findFirst).not.toHaveBeenCalled();
    expect(h.headers.ETag).toBeUndefined();
  });
});
