import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import type { ClientReviewsService } from './client-reviews.service';
import { ReviewAppealsAuditService } from './review-appeals-audit.service';

const admin: AdminActor = {
  id: 'admin-1',
  adminRole: 'moderator',
  sessionId: 's',
  justification: null,
  ip: '10.0.0.1',
};

describe('ReviewAppealsAuditService.decide', () => {
  it('decides through ClientReviewsService and audits each decided appeal', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([
        { id: 'a1', review_id: 'r1' },
        { id: 'a2', review_id: 'r2' },
      ])
      // a2 was decided concurrently by someone else.
      .mockResolvedValueOnce([{ id: 'a1', review_id: 'r1' }]);
    const prisma = {
      clientReviewAppeal: { findMany },
    } as unknown as PrismaService;
    const reviews = {
      decideAppeals: jest.fn().mockResolvedValue({ decided: 1 }),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new ReviewAppealsAuditService(
      prisma,
      reviews as unknown as ClientReviewsService,
      audit as unknown as AuditLogService,
    );
    const dto = {
      ids: ['a1', 'a2'],
      decision: 'accept' as const,
      note: 'Fake review',
    };
    await expect(service.decide(admin, dto)).resolves.toEqual({ decided: 1 });
    expect(reviews.decideAppeals).toHaveBeenCalledWith('admin-1', dto);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith({
      adminId: 'admin-1',
      action: 'admin.review_appeal.decide',
      targetType: 'review_appeal',
      targetId: 'a1',
      before: { status: 'pending' },
      after: {
        status: 'accepted',
        decision: 'accept',
        reviewId: 'r1',
        reviewStatus: 'removed',
        note: 'Fake review',
      },
      ip: '10.0.0.1',
    });
  });
});
