import { FollowsService } from './follows.service';

describe('FollowsService.suggestions reason', () => {
  it('marks people from my address book with reason "contacts"', async () => {
    const prisma = {
      clientProfile: { findUnique: jest.fn() },
      follow: { findMany: jest.fn().mockResolvedValue([]) },
      contactMatch: {
        findMany: jest.fn().mockResolvedValue([{ matched_id: 'b' }]),
      },
    };
    const blocks = { hiddenIds: jest.fn().mockResolvedValue(new Set()) };
    const reco = { peopleFor: jest.fn().mockResolvedValue(['a', 'b']) };
    const svc = Object.create(FollowsService.prototype) as FollowsService;
    Object.assign(svc, {
      prisma,
      blocks,
      recommendations: reco,
      present: jest.fn((ids: string[]) =>
        Promise.resolve(ids.map((id) => ({ id }))),
      ),
    });
    const page = await svc.suggestions(
      { sub: 'me', role: 'attorney' } as never,
      undefined,
    );
    expect(page.items).toEqual([{ id: 'a' }, { id: 'b', reason: 'contacts' }]);
    expect(prisma.contactMatch.findMany).toHaveBeenCalledWith({
      where: { owner_id: 'me', matched_id: { in: ['a', 'b'] } },
      select: { matched_id: true },
    });
  });

  it('limit sets the page size and the cursor continues from there', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const svc = Object.create(FollowsService.prototype) as FollowsService;
    Object.assign(svc, {
      prisma: {
        clientProfile: { findUnique: jest.fn() },
        follow: { findMany: jest.fn().mockResolvedValue([]) },
        contactMatch: { findMany: jest.fn().mockResolvedValue([]) },
      },
      blocks: { hiddenIds: jest.fn().mockResolvedValue(new Set()) },
      recommendations: { peopleFor: jest.fn().mockResolvedValue(ids) },
      present: jest.fn((p: string[]) =>
        Promise.resolve(p.map((id) => ({ id }))),
      ),
    });
    const user = { sub: 'me', role: 'attorney' } as never;
    const p1 = await svc.suggestions(user, undefined, 2);
    expect(p1.items.map((i) => i.id)).toEqual(['a', 'b']);
    const p2 = await svc.suggestions(user, p1.nextCursor!, 2);
    expect(p2.items.map((i) => i.id)).toEqual(['c', 'd']);
    const p3 = await svc.suggestions(user, p2.nextCursor!, 2);
    expect(p3.items.map((i) => i.id)).toEqual(['e']);
    expect(p3.nextCursor).toBeNull();
  });

  // R-389 (owner 04.11): a small base fills a client's grid with the
  // popular attorneys of their state, followed ones included.
  function svcWith(ranked: string[], popular: string[], hidden: string[] = []) {
    const svc = Object.create(FollowsService.prototype) as FollowsService;
    const suggestionPool = jest.fn().mockResolvedValue(popular);
    Object.assign(svc, {
      prisma: {
        clientProfile: {
          findUnique: jest.fn().mockResolvedValue({ state_code: 'NY' }),
        },
        follow: { findMany: jest.fn().mockResolvedValue([]) },
        contactMatch: { findMany: jest.fn().mockResolvedValue([]) },
      },
      blocks: { hiddenIds: jest.fn().mockResolvedValue(new Set(hidden)) },
      recommendations: { peopleFor: jest.fn().mockResolvedValue(ranked) },
      suggestionPool,
      present: jest.fn((p: string[]) =>
        Promise.resolve(p.map((id) => ({ id }))),
      ),
    });
    return { svc, suggestionPool };
  }

  it('client with fewer than 4 real suggestions: filled from the popular pool', async () => {
    const { svc, suggestionPool } = svcWith(
      ['r1'],
      ['me', 'r1', 'f1', 'blocked', 'f2', 'p3', 'p4', 'p5'],
      ['blocked'],
    );
    const page = await svc.suggestions(
      { sub: 'me', role: 'client' } as never,
      undefined,
      5,
    );
    expect(page.items.map((i) => i.id)).toEqual(['r1', 'f1', 'f2', 'p3', 'p4']);
    expect(page.nextCursor).toBeNull();
    expect(suggestionPool).toHaveBeenCalledWith('NY');
  });

  it('client with 4 or more real suggestions: §6.3 as before, no fill', async () => {
    const { svc, suggestionPool } = svcWith(['a', 'b', 'c', 'd'], ['x']);
    const page = await svc.suggestions(
      { sub: 'me', role: 'client' } as never,
      undefined,
      5,
    );
    expect(page.items.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(suggestionPool).not.toHaveBeenCalled();
  });

  it('an attorney and a later page are never filled', async () => {
    const att = svcWith(['a'], ['x']);
    await att.svc.suggestions({ sub: 'me', role: 'attorney' } as never);
    expect(att.suggestionPool).not.toHaveBeenCalled();
    const later = svcWith(['a'], ['x']);
    await later.svc.suggestions(
      { sub: 'me', role: 'client' } as never,
      Buffer.from('1').toString('base64url'),
    );
    expect(later.suggestionPool).not.toHaveBeenCalled();
  });
});
