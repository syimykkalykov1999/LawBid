import { HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ModerationService } from '../moderation/moderation.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { ReviewsService } from './reviews.service';

const CLIENT: RequestUser = {
  sub: 'client-1',
  role: 'client',
  sid: 's',
  verified: false,
  subscriptionStatus: 'none',
};
const DAY = 24 * 60 * 60 * 1000;

function review(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    case_id: 'case-1',
    client_id: 'client-1',
    attorney_id: 'att-1',
    rating: 5,
    body: 'Great',
    status: 'published',
    edited_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    client: { first_name: 'Anna', last_name: 'Kowalski' },
    ...overrides,
  };
}

function setup() {
  const tx = {
    case: { findUnique: jest.fn() },
    review: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    report: { findFirst: jest.fn(), create: jest.fn() },
    $queryRaw: jest.fn(() =>
      Promise.resolve([{ rating_avg: '4.50', rating_count: 2n }]),
    ),
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    review: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    attorneyProfile: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          verification_status: 'verified',
          user: { deleted_at: null, status: 'active' },
        }),
      ),
    },
  };
  const settings = { number: jest.fn(() => Promise.resolve(14)) };
  const notifications = { emit: jest.fn(() => Promise.resolve({ id: 'n' })) };
  const moderation = {
    autoHideIfThreshold: jest.fn(() => Promise.resolve(false)),
  };
  const service = new ReviewsService(
    prisma as unknown as PrismaService,
    settings as unknown as AppSettingsService,
    notifications as unknown as NotificationsService,
    moderation as unknown as ModerationService,
  );
  return { tx, prisma, settings, notifications, service };
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (error) {
    return (error as HttpException).getResponse() instanceof Object
      ? ((error as HttpException).getResponse() as { code: string }).code
      : 'NO_CODE';
  }
  return 'RESOLVED';
}

describe('ReviewsService.create (docs/03 §7.1)', () => {
  const closedCase = {
    client_id: 'client-1',
    status: 'closed',
    accepted_bid: { attorney_id: 'att-1', status: 'accepted' },
  };

  it('creates, recalculates the rating in the same tx and notifies the attorney', async () => {
    const { tx, service, notifications } = setup();
    tx.case.findUnique.mockResolvedValue(closedCase);
    tx.review.findUnique.mockResolvedValue(null);
    tx.review.create.mockResolvedValue(review());

    const dto = await service.create(CLIENT, 'case-1', { rating: 5 });

    expect(tx.review.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          case_id: 'case-1',
          client_id: 'client-1',
          attorney_id: 'att-1',
          rating: 5,
          body: null,
        },
      }),
    );
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(notifications.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'review_received',
        recipientId: 'att-1',
        payload: expect.objectContaining({
          reviewId: 'r1',
          authorDisplayName: 'Anna K.',
        }),
      }),
      tx,
    );
    expect(dto).toMatchObject({
      id: 'r1',
      caseId: 'case-1',
      attorneyId: 'att-1',
      authorDisplayName: 'Anna K.',
      status: 'published',
    });
    expect(
      new Date(dto.editableUntil).getTime() - new Date(dto.createdAt).getTime(),
    ).toBe(14 * DAY);
  });

  it.each([
    [{ ...closedCase, status: 'in_progress' }, 'REVIEW_CASE_NOT_CLOSED'],
    [{ ...closedCase, accepted_bid: null }, 'REVIEW_NO_ACCEPTED_BID'],
    [
      {
        ...closedCase,
        accepted_bid: { attorney_id: 'att-1', status: 'withdrawn' },
      },
      'REVIEW_NO_ACCEPTED_BID',
    ],
    [{ ...closedCase, client_id: 'someone-else' }, 'NOT_FOUND'],
    [null, 'NOT_FOUND'],
  ])('refuses %j with %s and writes nothing', async (kase, code) => {
    const { tx, service, notifications } = setup();
    tx.case.findUnique.mockResolvedValue(kase);
    expect(await codeOf(service.create(CLIENT, 'case-1', { rating: 4 }))).toBe(
      code,
    );
    expect(tx.review.create).not.toHaveBeenCalled();
    expect(notifications.emit).not.toHaveBeenCalled();
  });

  it('rejects a second review for the case', async () => {
    const { tx, service } = setup();
    tx.case.findUnique.mockResolvedValue(closedCase);
    tx.review.findUnique.mockResolvedValue({ id: 'r0' });
    expect(await codeOf(service.create(CLIENT, 'case-1', { rating: 4 }))).toBe(
      'REVIEW_ALREADY_EXISTS',
    );
  });

  it('maps a concurrent unique violation to REVIEW_ALREADY_EXISTS', async () => {
    const { tx, service } = setup();
    tx.case.findUnique.mockResolvedValue(closedCase);
    tx.review.findUnique.mockResolvedValue(null);
    tx.review.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'x',
      }),
    );
    expect(await codeOf(service.create(CLIENT, 'case-1', { rating: 4 }))).toBe(
      'REVIEW_ALREADY_EXISTS',
    );
  });

  it('only clients may review', async () => {
    const { service, prisma } = setup();
    expect(
      await codeOf(
        service.create({ ...CLIENT, role: 'attorney' }, 'case-1', {
          rating: 5,
        }),
      ),
    ).toBe('FORBIDDEN');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('ReviewsService.getForCase (own review for editing, §7.2)', () => {
  const withCase = (o: Record<string, unknown> = {}) => ({
    ...review(o),
    case: { client_id: 'client-1' },
  });

  it('returns the client own review with the edit deadline', async () => {
    const { prisma, service } = setup();
    prisma.review.findUnique.mockResolvedValue(withCase());
    const dto = await service.getForCase(CLIENT, 'case-1');
    expect(dto).toMatchObject({
      id: 'r1',
      caseId: 'case-1',
      rating: 5,
      editable: true,
    });
    expect(
      new Date(dto.editableUntil).getTime() - new Date(dto.createdAt).getTime(),
    ).toBe(14 * DAY);
  });

  it('is not editable after the window or once moderated', async () => {
    const { prisma, service } = setup();
    prisma.review.findUnique.mockResolvedValue(
      withCase({ created_at: new Date(Date.now() - 15 * DAY) }),
    );
    expect((await service.getForCase(CLIENT, 'case-1')).editable).toBe(false);
    prisma.review.findUnique.mockResolvedValue(withCase({ status: 'hidden' }));
    expect((await service.getForCase(CLIENT, 'case-1')).editable).toBe(false);
  });

  it('404 for anyone but the client of the case, and when there is no review', async () => {
    const { prisma, service } = setup();
    prisma.review.findUnique.mockResolvedValue(withCase());
    expect(
      await codeOf(service.getForCase({ ...CLIENT, sub: 'other' }, 'case-1')),
    ).toBe('NOT_FOUND');
    prisma.review.findUnique.mockResolvedValue(null);
    expect(await codeOf(service.getForCase(CLIENT, 'case-1'))).toBe(
      'NOT_FOUND',
    );
  });
});

describe('ReviewsService.update (edit window, §7.2)', () => {
  it('edits within the window, sets edited_at and recalculates', async () => {
    const { tx, service } = setup();
    const created = new Date(Date.now() - 13 * DAY);
    tx.review.findUnique.mockResolvedValue(review({ created_at: created }));
    tx.review.update.mockImplementation(
      (args: { data: Record<string, unknown> }) =>
        Promise.resolve(review({ created_at: created, ...args.data })),
    );

    const dto = await service.update(CLIENT, 'r1', { rating: 3 });

    const data = (
      tx.review.update.mock.calls[0] as [{ data: Record<string, unknown> }]
    )[0].data;
    expect(data.rating).toBe(3);
    expect(data).not.toHaveProperty('body');
    expect(data.edited_at).toBeInstanceOf(Date);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(dto.editedAt).not.toBeNull();
  });

  it('refuses after review.edit_window_days', async () => {
    const { tx, service } = setup();
    tx.review.findUnique.mockResolvedValue(
      review({ created_at: new Date(Date.now() - 15 * DAY) }),
    );
    expect(await codeOf(service.update(CLIENT, 'r1', { rating: 1 }))).toBe(
      'REVIEW_EDIT_WINDOW_EXPIRED',
    );
    expect(tx.review.update).not.toHaveBeenCalled();
  });

  it('refuses a moderated review and hides others’ reviews', async () => {
    const { tx, service } = setup();
    tx.review.findUnique.mockResolvedValueOnce(review({ status: 'hidden' }));
    expect(await codeOf(service.update(CLIENT, 'r1', { rating: 1 }))).toBe(
      'REVIEW_NOT_EDITABLE',
    );
    tx.review.findUnique.mockResolvedValueOnce(
      review({ client_id: 'other-client' }),
    );
    expect(await codeOf(service.update(CLIENT, 'r1', { rating: 1 }))).toBe(
      'NOT_FOUND',
    );
  });

  it('requires at least one field', async () => {
    const { service } = setup();
    expect(await codeOf(service.update(CLIENT, 'r1', {}))).toBe(
      'VALIDATION_ERROR',
    );
  });
});

describe('ReviewsService.list / summary (§7.4)', () => {
  it('pages newest first with a keyset cursor, published only', async () => {
    const { prisma, service } = setup();
    const rows = [3, 2, 1].map((n) =>
      review({
        id: `0000000${n}-0000-4000-8000-000000000000`,
        created_at: new Date(Date.UTC(2026, 0, n)),
      }),
    );
    prisma.review.findMany.mockResolvedValueOnce(rows);

    const page1 = await service.list('att-1', { limit: 2 });
    expect(page1.items.map((r) => r.id)).toEqual([rows[0].id, rows[1].id]);
    expect(page1.items[0]).not.toHaveProperty('caseId');
    expect(page1.items[0].authorDisplayName).toBe('Anna K.');
    expect(page1.nextCursor).toEqual(expect.any(String));
    const where = (
      prisma.review.findMany.mock.calls[0] as [
        { where: Record<string, unknown>; take: number },
      ]
    )[0];
    expect(where.where).toMatchObject({
      attorney_id: 'att-1',
      status: 'published',
    });
    expect(where.take).toBe(3);

    prisma.review.findMany.mockResolvedValueOnce([rows[2]]);
    const page2 = await service.list('att-1', {
      limit: 2,
      cursor: page1.nextCursor!,
    });
    expect(page2.nextCursor).toBeNull();
    const second = (
      prisma.review.findMany.mock.calls[1] as [{ where: { OR: unknown[] } }]
    )[0];
    expect(second.where.OR).toEqual([
      { created_at: { lt: rows[1].created_at } },
      { created_at: rows[1].created_at, id: { lt: rows[1].id } },
    ]);
  });

  it('404s for a suspended attorney', async () => {
    const { prisma, service } = setup();
    prisma.attorneyProfile.findUnique.mockResolvedValueOnce({
      verification_status: 'suspended',
      user: { deleted_at: null, status: 'active' },
    });
    expect(await codeOf(service.summary('att-1'))).toBe('NOT_FOUND');
  });

  it('summarizes average (1 decimal), count and 5→1 distribution', async () => {
    const { prisma, service } = setup();
    prisma.review.groupBy.mockResolvedValue([
      { rating: 5, _count: { _all: 2 } },
      { rating: 4, _count: { _all: 1 } },
    ]);
    await expect(service.summary('att-1')).resolves.toEqual({
      ratingAvg: 4.7,
      ratingCount: 3,
      distribution: [
        { stars: 5, count: 2 },
        { stars: 4, count: 1 },
        { stars: 3, count: 0 },
        { stars: 2, count: 0 },
        { stars: 1, count: 0 },
      ],
    });
  });

  it('has no average without reviews', async () => {
    const { prisma, service } = setup();
    prisma.review.groupBy.mockResolvedValue([]);
    await expect(service.summary('att-1')).resolves.toMatchObject({
      ratingAvg: null,
      ratingCount: 0,
    });
  });
});

describe('ReviewsService.report (§7.2)', () => {
  const ATTORNEY: RequestUser = { ...CLIENT, sub: 'att-1', role: 'attorney' };

  it('files a review report for the reviewed attorney', async () => {
    const { tx, prisma, service } = setup();
    prisma.review.findUnique.mockResolvedValue({
      id: 'r1',
      attorney_id: 'att-1',
      status: 'published',
    });
    tx.report.findFirst.mockResolvedValue(null);
    tx.report.create.mockResolvedValue({
      id: 'rep1',
      reason: 'abuse',
      status: 'open',
      created_at: new Date(),
    });
    await expect(
      service.report(ATTORNEY, 'r1', { reason: 'abuse' }),
    ).resolves.toMatchObject({ id: 'rep1', reviewId: 'r1', status: 'open' });
    expect(tx.report.create).toHaveBeenCalledWith({
      data: {
        reporter_id: 'att-1',
        target_type: 'review',
        target_id: 'r1',
        reason: 'abuse',
        note: null,
      },
    });
  });

  it('returns the still-open report instead of a duplicate', async () => {
    const { tx, prisma, service } = setup();
    prisma.review.findUnique.mockResolvedValue({
      id: 'r1',
      attorney_id: 'att-1',
      status: 'published',
    });
    tx.report.findFirst.mockResolvedValue({
      id: 'rep0',
      reason: 'spam',
      status: 'open',
      created_at: new Date(),
    });
    await expect(
      service.report(ATTORNEY, 'r1', { reason: 'abuse' }),
    ).resolves.toMatchObject({ id: 'rep0' });
    expect(tx.report.create).not.toHaveBeenCalled();
  });

  it('forbids anyone but the reviewed attorney', async () => {
    const { prisma, service } = setup();
    prisma.review.findUnique.mockResolvedValue({
      id: 'r1',
      attorney_id: 'att-1',
      status: 'published',
    });
    expect(await codeOf(service.report(CLIENT, 'r1', { reason: 'spam' }))).toBe(
      'FORBIDDEN',
    );
  });
});

describe('ReviewsService.requestReview (§7.3, for file 04)', () => {
  it('emits review_requested to the client', async () => {
    const { service, notifications } = setup();
    await service.requestReview({
      caseId: 'c1',
      clientId: 'client-1',
      attorneyId: 'att-1',
    });
    expect(notifications.emit).toHaveBeenCalledWith(
      {
        type: 'review_requested',
        recipientId: 'client-1',
        payload: { caseId: 'c1', attorneyId: 'att-1', reminder: false },
      },
      undefined,
    );
  });
});
