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
});
