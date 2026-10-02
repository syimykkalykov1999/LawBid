import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import type { AdminReviewAppealsDecisionDto } from './client-reviews.dto';
import { ClientReviewsService } from './client-reviews.service';

export const REVIEW_APPEAL_AUDIT = 'admin.review_appeal.decide';

/**
 * Audit 2026-10-02: an appeal decision left only a generic row with no
 * target. This wraps ClientReviewsService.decideAppeals() (unchanged: it
 * still decides and tells the appellant) and writes one audit_log row per
 * appeal that actually changed — before `pending`, after the decision,
 * the review id and the admin's note.
 */
@Injectable()
export class ReviewAppealsAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviews: ClientReviewsService,
    private readonly audit: AuditLogService,
  ) {}

  async decide(
    admin: AdminActor,
    dto: AdminReviewAppealsDecisionDto,
  ): Promise<{ decided: number }> {
    const pending = await this.prisma.clientReviewAppeal.findMany({
      where: { id: { in: dto.ids }, status: 'pending' },
      select: { id: true, review_id: true },
    });
    const result = await this.reviews.decideAppeals(admin.id, dto);
    if (pending.length === 0) return result;
    const status = dto.decision === 'accept' ? 'accepted' : 'rejected';
    // Only rows this call decided (a concurrent decision is not ours).
    const decided = await this.prisma.clientReviewAppeal.findMany({
      where: {
        id: { in: pending.map((p) => p.id) },
        status,
        decided_by: admin.id,
      },
      select: { id: true, review_id: true },
    });
    for (const a of decided) {
      await this.audit.record({
        adminId: admin.id,
        action: REVIEW_APPEAL_AUDIT,
        targetType: 'review_appeal',
        targetId: a.id,
        before: { status: 'pending' },
        after: {
          status,
          decision: dto.decision,
          reviewId: a.review_id,
          reviewStatus: dto.decision === 'accept' ? 'removed' : 'published',
          note: dto.note ?? null,
        },
        ip: admin.ip,
      });
    }
    return result;
  }
}
