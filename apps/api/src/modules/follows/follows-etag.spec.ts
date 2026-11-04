import type { Request, Response } from 'express';
import { FollowsController } from './follows.controller';
import { FollowsService } from './follows.service';

/** R-385: the first page of a follow list is a 304 from the follows
 * indexes while nothing changed; the profile check still runs. */
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

describe('follow lists cheap ETag (R-385)', () => {
  const user = { sub: 'viewer' } as never;
  const build = () => {
    const prisma = {
      follow: {
        count: jest.fn().mockResolvedValue(3),
        findFirst: jest.fn().mockResolvedValue({ created_at: new Date(5) }),
      },
    };
    const svc = Object.create(FollowsService.prototype) as FollowsService;
    Object.assign(svc, { prisma });
    const assertListable = jest
      .spyOn(svc, 'assertListable')
      .mockResolvedValue(undefined);
    const page = { items: [], nextCursor: null };
    const followers = jest.spyOn(svc, 'followers').mockResolvedValue(page);
    const following = jest.spyOn(svc, 'following').mockResolvedValue(page);
    const mine = jest.spyOn(svc, 'mine').mockResolvedValue(page);
    return {
      c: new FollowsController(svc),
      prisma,
      assertListable,
      followers,
      following,
      mine,
    };
  };
  const a1 = { id: 'a1' } as never;

  it('followers: unchanged list is a 304 after the visibility check', async () => {
    const t = build();
    const first = http();
    await t.c.listFollowers(user, a1, {}, first.req, first.res);
    expect(first.headers.ETag).toMatch(/^W\/"follows-followers-a1-viewer-/);
    const again = http(first.headers.ETag);
    expect(
      await t.c.listFollowers(user, a1, {}, again.req, again.res),
    ).toBeUndefined();
    expect(again.status).toHaveBeenCalledWith(304);
    expect(t.assertListable).toHaveBeenCalledWith('a1');
    expect(t.followers).toHaveBeenCalledTimes(1);
  });

  it('an unfollow (size change) answers the new page', async () => {
    const t = build();
    const first = http();
    await t.c.listFollowing(user, a1, {}, first.req, first.res);
    t.prisma.follow.count.mockResolvedValue(2);
    const again = http(first.headers.ETag);
    expect(
      await t.c.listFollowing(user, a1, {}, again.req, again.res),
    ).toBeDefined();
    expect(t.following).toHaveBeenCalledTimes(2);
  });

  it('a search or a next page is never tagged', async () => {
    const t = build();
    const h = http('W/"x"');
    await t.c.listMyFollowing(user, { q: 'ann' }, h.req, h.res);
    await t.c.listFollowers(user, a1, { cursor: 'x' }, h.req, h.res);
    expect(t.prisma.follow.count).not.toHaveBeenCalled();
    expect(t.mine).toHaveBeenCalledTimes(1);
  });
});
