import { ForbiddenException } from '@nestjs/common';
import { CasesFeedService } from './cases-feed.service';
import type { CaseViewer } from '../policies/case-access.policy';

const leaf = {
  id: 'leaf-1',
  code: 'traffic_tickets.speeding',
  i18n_key: 'practice.traffic_tickets.speeding',
  name_en: 'Speeding',
  parent: {
    id: 'cat-1',
    code: 'traffic_tickets',
    i18n_key: 'practice.traffic_tickets',
    name_en: 'Traffic Tickets',
  },
};

function caseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'case-1',
    title: 'Speeding ticket',
    practice_area: leaf,
    primary_state_code: 'NJ',
    states: [
      { state_code: 'NJ', is_primary: true },
      { state_code: 'NY', is_primary: false },
    ],
    city: 'Newark',
    status: 'open',
    budget_mode: 'amount',
    budget_cents: 60000,
    view_count: 3,
    bids_count: 1,
    created_at: new Date(),
    description: 'Got a ticket on the turnpike.',
    ...overrides,
  };
}

function fakeDeps(opts: {
  cases?: ReturnType<typeof caseRow>[];
  ownBidCaseIds?: string[];
  savedItem?: unknown;
  verificationStatus?: string | null;
  accessDecision?: { kind: string; clientIdentityVisible: boolean } | null;
}) {
  const prisma = {
    case: {
      findMany: jest.fn().mockResolvedValue(opts.cases ?? [caseRow()]),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        description: (opts.cases ?? [caseRow()])[0].description,
      }),
    },
    bid: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          (opts.ownBidCaseIds ?? []).map((case_id) => ({ case_id })),
        ),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    savedItem: {
      findFirst: jest.fn().mockResolvedValue(opts.savedItem ?? null),
      // OQ-034: feed items carry isSaved.
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    attorneyProfile: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          opts.verificationStatus === undefined
            ? { verification_status: 'verified' }
            : opts.verificationStatus === null
              ? null
              : { verification_status: opts.verificationStatus },
        ),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const access = {
    assertVisibleToAttorney: jest.fn().mockImplementation(() => {
      if (opts.accessDecision === null) {
        const { caseNotAvailable } = jest.requireActual<
          typeof import('../policies/case-access.policy')
        >('../policies/case-access.policy');
        throw caseNotAvailable();
      }
      return Promise.resolve(
        opts.accessDecision ?? {
          kind: 'attorney_prospect',
          clientIdentityVisible: false,
        },
      );
    }),
  };
  const viewTracking = { recordView: jest.fn().mockResolvedValue(true) };
  const posts = { save: jest.fn(), unsave: jest.fn() };
  const service = new CasesFeedService(
    prisma as never,
    access as never,
    viewTracking as never,
    posts as never,
  );
  return { prisma, access, viewTracking, posts, service };
}

const attorney: CaseViewer = { userId: 'att-1', role: 'attorney' };

describe('CasesFeedService', () => {
  describe('listFeed', () => {
    it('non-attorney → FORBIDDEN', async () => {
      const { service } = fakeDeps({});
      await expect(
        service.listFeed({ userId: 'c1', role: 'client' }, {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('unverified attorney → empty page, no query run', async () => {
      const { service, prisma } = fakeDeps({ verificationStatus: 'pending' });
      const page = await service.listFeed(attorney, {});
      expect(page).toEqual({ items: [], nextCursor: null });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('hydrates rows in the SQL result order, with own-bid + NEW flags', async () => {
      const now = new Date();
      const old = new Date(now.getTime() - 48 * 3600 * 1000);
      const rowNew = caseRow({ id: 'case-new', created_at: now });
      const rowOld = caseRow({ id: 'case-old', created_at: old });
      const { service, prisma } = fakeDeps({
        cases: [rowOld, rowNew],
        ownBidCaseIds: ['case-old'],
      });
      prisma.$queryRaw.mockResolvedValue([
        { id: 'case-new', created_at: now },
        { id: 'case-old', created_at: old },
      ]);
      const page = await service.listFeed(attorney, {});
      expect(page.items.map((i) => i.id)).toEqual(['case-new', 'case-old']);
      expect(page.items[0].isNew).toBe(true);
      expect(page.items[0].hasOwnBid).toBe(false);
      expect(page.items[1].isNew).toBe(false);
      expect(page.items[1].hasOwnBid).toBe(true);
      expect(page.items[0].practiceArea).toEqual({
        id: 'leaf-1',
        code: 'traffic_tickets.speeding',
        i18nKey: 'practice.traffic_tickets.speeding',
        nameEn: 'Speeding',
        categoryId: 'cat-1',
        categoryCode: 'traffic_tickets',
        categoryI18nKey: 'practice.traffic_tickets',
        categoryNameEn: 'Traffic Tickets',
      });
      expect(page.items[0].additionalStateCodes).toEqual(['NY']);
      expect(page.nextCursor).toBeNull();
    });

    it('never includes any client field on a feed item', async () => {
      const row = caseRow();
      const { service, prisma } = fakeDeps({ cases: [row] });
      prisma.$queryRaw.mockResolvedValue([
        { id: row.id, created_at: row.created_at },
      ]);
      const page = await service.listFeed(attorney, {});
      const keys = Object.keys(page.items[0]);
      for (const forbidden of [
        'clientId',
        'clientName',
        'client',
        'phone',
        'email',
      ]) {
        expect(keys).not.toContain(forbidden);
      }
    });
  });

  describe('getDetailForAttorney', () => {
    it('CASE_NOT_AVAILABLE when the policy denies (no CASE_NOT_FOUND)', async () => {
      const { service } = fakeDeps({ accessDecision: null });
      await expect(
        service.getDetailForAttorney('att-1', 'case-1'),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('includes description and isSaved, still no client field', async () => {
      const { service } = fakeDeps({ savedItem: { user_id: 'att-1' } });
      const detail = await service.getDetailForAttorney('att-1', 'case-1');
      expect(detail.description).toBe('Got a ticket on the turnpike.');
      expect(detail.isSaved).toBe(true);
      expect(detail.ownBidId).toBeNull();
      expect(Object.keys(detail)).not.toContain('client');
    });
  });

  describe('recordView', () => {
    it('checks visibility before tracking', async () => {
      const { service, access, viewTracking } = fakeDeps({});
      await service.recordView('att-1', 'case-1');
      expect(access.assertVisibleToAttorney).toHaveBeenCalledWith(
        'att-1',
        'case-1',
      );
      expect(viewTracking.recordView).toHaveBeenCalledWith('att-1', 'case-1');
    });

    it('denied case never reaches the tracker', async () => {
      const { service, viewTracking } = fakeDeps({ accessDecision: null });
      await expect(service.recordView('att-1', 'case-1')).rejects.toMatchObject(
        {
          status: 404,
        },
      );
      expect(viewTracking.recordView).not.toHaveBeenCalled();
    });
  });

  describe('save / unsave', () => {
    it('save: only an attorney, only a visible case, item_type case', async () => {
      const { service, prisma } = fakeDeps({});
      await service.save(attorney, { itemType: 'case', itemId: 'case-1' });
      expect(prisma.savedItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            user_id_item_type_item_id: {
              user_id: 'att-1',
              item_type: 'case',
              item_id: 'case-1',
            },
          },
        }),
      );
    });

    it('save: client role → FORBIDDEN', async () => {
      const { service } = fakeDeps({});
      await expect(
        service.save(
          { userId: 'c1', role: 'client' },
          { itemType: 'case', itemId: 'case-1' },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('save: itemType post goes to the posts module (docs/05 §4)', async () => {
      const { service, posts } = fakeDeps({});
      await service.save(attorney, { itemType: 'post', itemId: 'p1' });
      expect(posts.save).toHaveBeenCalledWith(attorney.userId, 'p1');
    });

    it('save: CASE_NOT_AVAILABLE when not visible', async () => {
      const { service } = fakeDeps({ accessDecision: null });
      await expect(
        service.save(attorney, { itemType: 'case', itemId: 'case-1' }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('unsave: no visibility check, deletes the row', async () => {
      const { service, prisma, access } = fakeDeps({});
      await service.unsave(attorney, { itemType: 'case', itemId: 'case-1' });
      expect(access.assertVisibleToAttorney).not.toHaveBeenCalled();
      expect(prisma.savedItem.deleteMany).toHaveBeenCalledWith({
        where: { user_id: 'att-1', item_type: 'case', item_id: 'case-1' },
      });
    });
  });
});
