import { BoostActions } from './boost-actions.service';

/** Owner 2026-10-27: real actions for boosts paid per action. */
function make(
  opts: {
    promos?: {
      id: string;
      user_id: string;
      post_id: string | null;
      case_id: string | null;
      billed_actions: string[];
    }[];
    view?: { promotion_id: string } | null;
    flipped?: number;
    spent?: boolean;
  } = {},
) {
  const promos = opts.promos ?? [
    {
      id: 'p1',
      user_id: 'author',
      post_id: 'post1',
      case_id: null,
      billed_actions: ['follow', 'save'],
    },
  ];
  const prisma = {
    casePromotion: {
      findMany: jest.fn(() => Promise.resolve(promos)),
      update: jest.fn(() => Promise.resolve({})),
    },
    promotionView: {
      findFirst: jest.fn(() =>
        Promise.resolve(
          opts.view === undefined ? { promotion_id: 'p1' } : opts.view,
        ),
      ),
      updateMany: jest.fn(() => Promise.resolve({ count: opts.flipped ?? 1 })),
    },
  };
  const bump = jest.fn(() => Promise.resolve());
  const settle = jest.fn(() => Promise.resolve(opts.spent ?? false));
  const svc = new BoostActions(
    prisma as never,
    { settle } as never,
    { bump } as never,
  );
  return { svc, prisma, bump, settle };
}

describe('BoostActions', () => {
  it('counts a follow once for the author’s boost the person was shown', async () => {
    const { svc, prisma, bump, settle } = make();
    expect(await svc.record('viewer', { ownerId: 'author' }, 'follow')).toBe(1);
    expect(prisma.promotionView.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          promotion_id: 'p1',
          user_id: 'viewer',
          acted: false,
        }),
        data: { acted: true },
      }),
    );
    expect(bump).toHaveBeenCalledWith('case_promotion', 'p1', 'actions', 1);
    expect(settle).toHaveBeenCalledWith('p1');
  });

  it('never counts the owner’s own action', async () => {
    const { svc, prisma, bump } = make();
    expect(await svc.record('author', { ownerId: 'author' }, 'follow')).toBe(0);
    expect(prisma.promotionView.findFirst).not.toHaveBeenCalled();
    expect(bump).not.toHaveBeenCalled();
  });

  it('counts only the kinds the buyer paid for', async () => {
    const { svc, prisma, bump } = make();
    expect(await svc.record('viewer', { postId: 'post1' }, 'message')).toBe(0);
    expect(prisma.promotionView.findFirst).not.toHaveBeenCalled();
    expect(bump).not.toHaveBeenCalled();
  });

  it('does not count a person who was never shown the boost', async () => {
    const { svc, bump } = make({ view: null });
    expect(await svc.record('viewer', { ownerId: 'author' }, 'follow')).toBe(0);
    expect(bump).not.toHaveBeenCalled();
  });

  it('does not count twice (the per-person flag was already flipped)', async () => {
    const { svc, bump } = make({ flipped: 0 });
    expect(await svc.record('viewer', { postId: 'post1' }, 'save')).toBe(0);
    expect(bump).not.toHaveBeenCalled();
  });

  it('does nothing when nobody pays per action (no query after the first)', async () => {
    const { svc, prisma } = make({ promos: [] });
    await svc.record('viewer', { ownerId: 'author' }, 'follow');
    await svc.record('viewer', { ownerId: 'author' }, 'follow');
    expect(prisma.casePromotion.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.promotionView.findFirst).not.toHaveBeenCalled();
  });

  it('needs something to match on (an action without a target counts nothing)', async () => {
    const { svc, bump } = make();
    expect(await svc.record('viewer', {}, 'follow')).toBe(0);
    expect(bump).not.toHaveBeenCalled();
  });

  it('forgets its list when the budget is used up', async () => {
    const { svc, prisma } = make({ spent: true });
    await svc.record('viewer', { postId: 'post1' }, 'save');
    await svc.record('viewer', { postId: 'post1' }, 'save');
    expect(prisma.casePromotion.findMany).toHaveBeenCalledTimes(2);
  });

  it('the app reports only the actions only it can see', async () => {
    const { svc, bump } = make({
      promos: [
        {
          id: 'p1',
          user_id: 'author',
          post_id: 'post1',
          case_id: null,
          billed_actions: ['watched', 'follow'],
        },
      ],
    });
    expect(await svc.reportClient('viewer', 'p1', 'watched')).toBe(true);
    expect(bump).toHaveBeenCalledTimes(1);
    // A server-side kind sent by a client is refused outright.
    expect(await svc.reportClient('viewer', 'p1', 'follow' as never)).toBe(
      false,
    );
    expect(bump).toHaveBeenCalledTimes(1);
  });

  it('a failure never throws into the flow it came from', async () => {
    const { svc, prisma } = make();
    prisma.casePromotion.findMany.mockRejectedValue(new Error('db down'));
    await expect(
      svc.record('viewer', { ownerId: 'author' }, 'follow'),
    ).resolves.toBe(0);
  });
});
