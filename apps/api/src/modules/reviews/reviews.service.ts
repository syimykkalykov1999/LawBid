import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Review } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { NotificationsService } from '../notifications/notifications.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import {
  REVIEWS_PAGE_DEFAULT,
  type CreateReviewDto,
  type ListReviewsQueryDto,
  type ReportReviewDto,
  type UpdateReviewDto,
} from './dto/review-requests.dto';
import type {
  PublicReviewDto,
  ReviewDto,
  ReviewPage,
  ReviewReportDto,
  ReviewSummaryDto,
} from './dto/review-responses.dto';
import { reviewerDisplayName } from './review-display';
import { displayRating, recalcAttorneyRating } from './review-rating';

const DAY_MS = 24 * 60 * 60 * 1000;

const CLIENT_NAME = {
  select: { first_name: true, last_name: true },
} as const;

type ReviewWithClient = Review & {
  client: { first_name: string | null; last_name: string | null };
};

/**
 * Reviews (docs/03_VERIFICATION_PROFILES.md §7).
 *
 * Access (deny by default): only the client of a `closed` case with an
 * accepted bid writes a review, only that client edits it (within
 * review.edit_window_days), nobody deletes it through the API; only the
 * reviewed attorney reports it. Every write that can change what counts as
 * a published review recalculates attorney_profiles.rating_avg/count in
 * the same withTxRetry transaction (§7.5).
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** POST /cases/:caseId/review (§7.1, §7.2). */
  async create(
    user: RequestUser,
    caseId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewDto> {
    if (user.role !== 'client') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only clients can review attorneys.',
      });
    }
    const windowDays = await this.settings.number('review.edit_window_days');
    try {
      const review = await withTxRetry(this.prisma, async (tx) => {
        const kase = await tx.case.findUnique({
          where: { id: caseId },
          select: {
            client_id: true,
            status: true,
            accepted_bid: { select: { attorney_id: true, status: true } },
          },
        });
        // Someone else's case is indistinguishable from a missing one.
        if (!kase || kase.client_id !== user.sub) throw notFound('Case');
        if (kase.status !== 'closed') {
          throw new ConflictException({
            code: ErrorCode.REVIEW_CASE_NOT_CLOSED,
            message: 'A review can be left only after the case is closed.',
          });
        }
        const bid = kase.accepted_bid;
        if (!bid || bid.status !== 'accepted') {
          throw new ConflictException({
            code: ErrorCode.REVIEW_NO_ACCEPTED_BID,
            message: 'This case has no accepted bid to review.',
          });
        }
        const existing = await tx.review.findUnique({
          where: { case_id: caseId },
          select: { id: true },
        });
        if (existing) throw alreadyExists();

        const created = await tx.review.create({
          data: {
            case_id: caseId,
            client_id: user.sub,
            attorney_id: bid.attorney_id,
            rating: dto.rating,
            body: dto.body ?? null,
          },
          include: { client: CLIENT_NAME },
        });
        await recalcAttorneyRating(tx, bid.attorney_id);
        await this.notifications.emit(
          {
            type: 'review_received',
            recipientId: bid.attorney_id,
            payload: {
              reviewId: created.id,
              caseId,
              rating: created.rating,
              authorDisplayName: reviewerDisplayName(
                created.client.first_name,
                created.client.last_name,
              ),
            },
          },
          tx,
        );
        return created;
      });
      return toOwnDto(review, windowDays);
    } catch (error) {
      // A concurrent submission with a different Idempotency-Key lost the
      // race on UQ reviews.case_id.
      if (isUniqueViolation(error)) throw alreadyExists();
      throw error;
    }
  }

  /**
   * GET /cases/:caseId/review — the client's own review of that case, so
   * the edit form can load it (§7.2). Deny by default: anyone but the
   * case's client (and a case without a review) gets 404 NOT_FOUND.
   */
  async getForCase(user: RequestUser, caseId: string): Promise<ReviewDto> {
    const review = await this.prisma.review.findUnique({
      where: { case_id: caseId },
      include: { client: CLIENT_NAME, case: { select: { client_id: true } } },
    });
    if (
      !review ||
      review.client_id !== user.sub ||
      review.case.client_id !== user.sub
    ) {
      throw notFound('Review');
    }
    const windowDays = await this.settings.number('review.edit_window_days');
    return toOwnDto(review, windowDays);
  }

  /** PATCH /reviews/:id — the author, within the edit window (§7.2). */
  async update(
    user: RequestUser,
    reviewId: string,
    dto: UpdateReviewDto,
  ): Promise<ReviewDto> {
    if (dto.rating === undefined && dto.body === undefined) {
      throw new HttpException(
        {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Nothing to update: send rating and/or body.',
          details: { fields: ['rating', 'body'] },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const windowDays = await this.settings.number('review.edit_window_days');
    const review = await withTxRetry(this.prisma, async (tx) => {
      const current = await tx.review.findUnique({ where: { id: reviewId } });
      if (!current || current.client_id !== user.sub) {
        throw notFound('Review');
      }
      if (current.status !== 'published') {
        throw new ConflictException({
          code: ErrorCode.REVIEW_NOT_EDITABLE,
          message: 'This review was moderated and can no longer be edited.',
        });
      }
      const now = new Date();
      if (now > editableUntil(current.created_at, windowDays)) {
        throw new ConflictException({
          code: ErrorCode.REVIEW_EDIT_WINDOW_EXPIRED,
          message: `A review can be edited only within ${windowDays} days.`,
          details: { editWindowDays: windowDays },
        });
      }
      const updated = await tx.review.update({
        where: { id: reviewId },
        data: {
          ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
          ...(dto.body !== undefined ? { body: dto.body } : {}),
          edited_at: now,
        },
        include: { client: CLIENT_NAME },
      });
      await recalcAttorneyRating(tx, current.attorney_id);
      return updated;
    });
    return toOwnDto(review, windowDays);
  }

  /** GET /attorneys/:id/reviews — published only, newest first (§7.4). */
  async list(
    attorneyId: string,
    query: ListReviewsQueryDto,
  ): Promise<ReviewPage> {
    await this.assertVisibleAttorney(attorneyId);
    const limit = query.limit ?? REVIEWS_PAGE_DEFAULT;
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const rows = await this.prisma.review.findMany({
      where: {
        attorney_id: attorneyId,
        status: 'published',
        ...(cursor
          ? {
              OR: [
                { created_at: { lt: cursor.createdAt } },
                { created_at: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { client: CLIENT_NAME },
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map(toPublicDto),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  /** GET /attorneys/:id/reviews/summary (§7.4). */
  async summary(attorneyId: string): Promise<ReviewSummaryDto> {
    await this.assertVisibleAttorney(attorneyId);
    const groups = await this.prisma.review.groupBy({
      by: ['rating'],
      where: { attorney_id: attorneyId, status: 'published' },
      _count: { _all: true },
    });
    const counts = new Map(groups.map((g) => [g.rating, g._count._all]));
    let total = 0;
    let sum = 0;
    for (const [stars, count] of counts) {
      total += count;
      sum += stars * count;
    }
    return {
      ratingAvg: total === 0 ? null : displayRating(sum / total),
      ratingCount: total,
      distribution: [5, 4, 3, 2, 1].map((stars) => ({
        stars,
        count: counts.get(stars) ?? 0,
      })),
    };
  }

  /**
   * POST /reviews/:id/report — the reviewed attorney complains; the report
   * lands in the moderation queue (docs/06 §"Модерация", reports.status
   * open). Repeating it while the attorney's report is still open returns
   * that report instead of stacking duplicates.
   */
  async report(
    user: RequestUser,
    reviewId: string,
    dto: ReportReviewDto,
  ): Promise<ReviewReportDto> {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, attorney_id: true, status: true },
    });
    const isOwnAttorney = review?.attorney_id === user.sub;
    if (!review || (review.status !== 'published' && !isOwnAttorney)) {
      throw notFound('Review');
    }
    if (!isOwnAttorney) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the reviewed attorney can report this review.',
      });
    }
    const report = await withTxRetry(this.prisma, async (tx) => {
      const open = await tx.report.findFirst({
        where: {
          reporter_id: user.sub,
          target_type: 'review',
          target_id: reviewId,
          status: 'open',
        },
      });
      if (open) return open;
      return tx.report.create({
        data: {
          reporter_id: user.sub,
          target_type: 'review',
          target_id: reviewId,
          reason: dto.reason,
          note: dto.note ?? null,
        },
      });
    });
    return {
      id: report.id,
      reviewId,
      reason: report.reason,
      status: report.status,
      createdAt: report.created_at.toISOString(),
    };
  }

  /**
   * §7.3: "Оцените работу адвоката" to the client when a case closes.
   * Called by file 04's case-closing transaction (docs/04, stage 4.x) with
   * its `tx`; the one reminder after review.reminder_after_days is sent by
   * jobs/handlers/review-reminder.job.ts.
   */
  async requestReview(
    input: { caseId: string; clientId: string; attorneyId: string },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.notifications.emit(
      {
        type: 'review_requested',
        recipientId: input.clientId,
        payload: {
          caseId: input.caseId,
          attorneyId: input.attorneyId,
          reminder: false,
        },
      },
      tx,
    );
  }

  /** Reviews of a missing, deleted or suspended attorney are not shown
   * (docs/03 §4.2: suspended → "Профиль недоступен"). */
  private async assertVisibleAttorney(attorneyId: string): Promise<void> {
    const profile = await this.prisma.attorneyProfile.findUnique({
      where: { user_id: attorneyId },
      select: {
        verification_status: true,
        user: { select: { deleted_at: true, status: true } },
      },
    });
    if (
      !profile ||
      profile.verification_status === 'suspended' ||
      profile.user.deleted_at !== null ||
      profile.user.status === 'deleted'
    ) {
      throw notFound('Attorney');
    }
  }
}

export function editableUntil(createdAt: Date, windowDays: number): Date {
  return new Date(createdAt.getTime() + windowDays * DAY_MS);
}

function toPublicDto(review: ReviewWithClient): PublicReviewDto {
  return {
    id: review.id,
    rating: review.rating,
    body: review.body,
    authorDisplayName: reviewerDisplayName(
      review.client.first_name,
      review.client.last_name,
    ),
    createdAt: review.created_at.toISOString(),
    editedAt: review.edited_at?.toISOString() ?? null,
  };
}

function toOwnDto(
  review: ReviewWithClient,
  windowDays: number,
  now = new Date(),
): ReviewDto {
  const until = editableUntil(review.created_at, windowDays);
  return {
    ...toPublicDto(review),
    caseId: review.case_id,
    attorneyId: review.attorney_id,
    status: review.status,
    editableUntil: until.toISOString(),
    editable: review.status === 'published' && now <= until,
  };
}

function notFound(what: string): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: `${what} not found.`,
  });
}

function alreadyExists(): ConflictException {
  return new ConflictException({
    code: ErrorCode.REVIEW_ALREADY_EXISTS,
    message: 'This case has already been reviewed.',
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
