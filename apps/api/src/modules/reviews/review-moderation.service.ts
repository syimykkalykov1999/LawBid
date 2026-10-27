import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { shardContext } from '../../sharding/shard-context';
import {
  CrossFamilyOutbox,
  type OutboxTicket,
} from '../../sharding/outbox/cross-family-outbox';
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
  constructor(
    private readonly prisma: PrismaService,
    // Shard-ready step 7: the rating average is a global-family row.
    @Optional() private readonly outbox?: CrossFamilyOutbox,
  ) {}

  async setStatus(
    input: ReviewModerationInput,
  ): Promise<ReviewModerationResult> {
    const tickets: Array<OutboxTicket | null> = [];
    // Written after the transaction commits (review R-68): the audit-chain
    // trigger holds one global advisory lock to the end of its transaction.
    const audit: { value: { reviewId: string; before: string } | null } = {
      value: null,
    };
    // A review's id carries its shard (children inherit the case's): pin it,
    // so the transaction runs on the database that holds the review.
    const result = await shardContext.runForCase(input.reviewId, () =>
      withTxRetry(this.prisma, async (tx) => {
        tickets.length = 0;
        audit.value = null;
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
          audit.value = { reviewId: review.id, before: review.status };
        }
        let rating: RatingTotals | null = null;
        if (this.outbox) {
          const ticket = await this.outbox.emit(
            tx,
            'attorney.rating.recalc',
            { attorneyId: review.attorney_id },
            `rating:${review.attorney_id}:${randomUUID()}`,
          );
          if (ticket) tickets.push(ticket);
          else rating = await ratingOf(tx, review.attorney_id); // ran inline
        } else {
          rating = await recalcAttorneyRating(tx, review.attorney_id);
        }
        return {
          reviewId: review.id,
          attorneyId: review.attorney_id,
          previousStatus: review.status,
          status: input.status,
          rating,
        };
      }),
    );
    if (audit.value) {
      const { reviewId, before } = audit.value;
      await this.prisma.auditLog.create({
        data: {
          admin_id: input.adminId,
          action: `review.${actionName(input.status)}`,
          target_type: 'review',
          target_id: reviewId,
          before: { status: before },
          after: {
            status: input.status,
            ...(input.reason ? { reason: input.reason } : {}),
          },
          ip: input.ip ?? null,
        },
      });
    }
    if (result.rating) return { ...result, rating: result.rating };
    // The event was stored on the shard's database: apply it now, then read.
    await this.outbox?.flush(tickets);
    return {
      ...result,
      rating: await ratingOf(this.prisma, result.attorneyId),
    };
  }
}

async function ratingOf(
  db: Pick<PrismaService, 'attorneyProfile'>,
  attorneyId: string,
): Promise<RatingTotals> {
  const p = await db.attorneyProfile.findUnique({
    where: { user_id: attorneyId },
    select: { rating_avg: true, rating_count: true },
  });
  return {
    ratingAvg: p ? Number(p.rating_avg.toString()) : 0,
    ratingCount: p?.rating_count ?? 0,
  };
}

function actionName(status: ReviewStatus): 'hide' | 'remove' | 'restore' {
  if (status === 'hidden') return 'hide';
  if (status === 'removed') return 'remove';
  return 'restore';
}
