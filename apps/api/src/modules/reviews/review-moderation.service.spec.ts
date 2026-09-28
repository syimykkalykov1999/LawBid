import type { PrismaService } from '../../prisma/prisma.service';
import { ReviewModerationService } from './review-moderation.service';

function setup(status = 'published') {
  const tx = {
    review: {
      findUnique: jest.fn(() =>
        Promise.resolve({ id: 'r1', attorney_id: 'att-1', status }),
      ),
      update: jest.fn(() => Promise.resolve({})),
    },
    auditLog: { create: jest.fn(() => Promise.resolve({})) },
    $queryRaw: jest.fn(() =>
      Promise.resolve([{ rating_avg: '0.00', rating_count: 0n }]),
    ),
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return {
    tx,
    service: new ReviewModerationService(prisma as unknown as PrismaService),
  };
}

describe('ReviewModerationService (docs/03 §7.2, §7.5; used by file 06)', () => {
  it('hides a review, recalculates the rating and audits, in one transaction', async () => {
    const { tx, service } = setup();
    await expect(
      service.setStatus({
        adminId: 'admin-1',
        reviewId: 'r1',
        status: 'hidden',
        reason: 'abusive language',
      }),
    ).resolves.toEqual({
      reviewId: 'r1',
      attorneyId: 'att-1',
      previousStatus: 'published',
      status: 'hidden',
      rating: { ratingAvg: 0, ratingCount: 0 },
    });
    expect(tx.review.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { status: 'hidden' },
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        admin_id: 'admin-1',
        action: 'review.hide',
        target_type: 'review',
        target_id: 'r1',
        before: { status: 'published' },
        after: { status: 'hidden', reason: 'abusive language' },
        ip: null,
      },
    });
  });

  it('is a no-op write (still reconciled) when the status is unchanged', async () => {
    const { tx, service } = setup('removed');
    await service.setStatus({
      adminId: 'admin-1',
      reviewId: 'r1',
      status: 'removed',
    });
    expect(tx.review.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
