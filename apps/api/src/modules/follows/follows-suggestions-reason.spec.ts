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
});
