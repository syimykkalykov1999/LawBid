import { Injectable, NotFoundException } from '@nestjs/common';
import type { ReviewStatus } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { recalcAttorneyRating, type RatingTotals } from './review-rating';

export interface ReviewModerationInput {
  adminId: string;
  reviewId: string;
  /** hidden / removed by a moderator, published = restore. */
  status: ReviewStatus;
  reason?: string;
  ip?: string;
}

export interface ReviewModerationResult {
  reviewId: string;
  attorneyId: string;
  previousStatus: ReviewStatus;
  status: ReviewStatus;
  rating: RatingTotals;
}

/**
 * Moderator actions on a review (docs/03 §7.2: "скрыть/удалить может
 * только модератор (файл 6)"). No HTTP surface here — the admin panel and
 * the reports queue of docs/06 call this service. One withTxRetry
 * transaction: status change, rating recalculation (§7.5) and the
 * audit_log row (docs/06: every admin action is audited). Role checks are
 * the caller's (docs/06 admin guards); this service trusts `adminId`.
 */
@Injectable()
export class ReviewModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async setStatus(
    input: ReviewModerationInput,
  ): Promise<ReviewModerationResult> {
    return withTxRetry(this.prisma, async (tx) => {
      const review = await tx.review.findUnique({
        where: { id: input.reviewId },
        select: { id: true, attorney_id: true, status: true },
      });
      if (!review) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Review not found.',
        });
      }
      if (review.status !== input.status) {
        await tx.review.update({
          where: { id: review.id },
          data: { status: input.status },
        });
        await tx.auditLog.create({
          data: {
            admin_id: input.adminId,
            action: `review.${actionName(input.status)}`,
            target_type: 'review',
            target_id: review.id,
            before: { status: review.status },
            after: {
              status: input.status,
              ...(input.reason ? { reason: input.reason } : {}),
            },
            ip: input.ip ?? null,
          },
        });
      }
      const rating = await recalcAttorneyRating(tx, review.attorney_id);
      return {
        reviewId: review.id,
        attorneyId: review.attorney_id,
        previousStatus: review.status,
        status: input.status,
        rating,
      };
    });
  }
}

function actionName(status: ReviewStatus): 'hide' | 'remove' | 'restore' {
  if (status === 'hidden') return 'hide';
  if (status === 'removed') return 'remove';
  return 'restore';
}
