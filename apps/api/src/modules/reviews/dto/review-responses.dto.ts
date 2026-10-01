import { ApiProperty } from '@nestjs/swagger';
import { ReportReason, ReportStatus, ReviewStatus } from '@prisma/client';

/** A published review as anyone sees it on the attorney's "Reviews" tab
 * (docs/03 §7.4). No case id (attorney-client privilege: an attorney's
 * cases are never public, §4.2), no client id or avatar. */
export class PublicReviewDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 5 })
  rating!: number;

  @ApiProperty({ type: String, nullable: true })
  body!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Reviewer as "First L." (docs/03 §7.4); null when the account has no name (show a localized placeholder).',
    example: 'Anna K.',
  })
  authorDisplayName!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Set when the client edited the review ("Edited" label).',
  })
  editedAt!: string | null;

  /** Owner 2026-10-01: true = written after a shared closed case. */
  @ApiProperty({ description: 'Verified by a closed case.' })
  fromCase!: boolean;

  @ApiProperty({
    enum: ['client', 'attorney', 'assistant'],
    enumName: 'ReviewAuthorRole',
  })
  authorRole!: 'client' | 'attorney' | 'assistant';

  // Owner 2026-10-01 (Google-style).
  @ApiProperty({
    type: String,
    nullable: true,
    description: "The attorney's public reply.",
  })
  reply!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  replyAt!: string | null;

  @ApiProperty({ type: 'integer' })
  helpfulCount!: number;

  @ApiProperty({ description: 'I marked it helpful.' })
  helpfulByMe!: boolean;

  @ApiProperty({ description: 'I wrote it (edit / delete).' })
  isMine!: boolean;
}

/** The client's own review (GET /cases/:caseId/review, create/edit). */
export class ReviewDto extends PublicReviewDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  caseId!: string | null;

  @ApiProperty({ format: 'uuid' })
  attorneyId!: string;

  @ApiProperty({ enum: ReviewStatus, enumName: 'ReviewStatus' })
  status!: ReviewStatus;

  @ApiProperty({
    format: 'date-time',
    description:
      'Last moment the client may edit (created + review.edit_window_days).',
  })
  editableUntil!: string;

  @ApiProperty({
    description:
      'True while PATCH /reviews/:id is allowed: still published and before editableUntil.',
  })
  editable!: boolean;
}

export class RatingBucketDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 5 })
  stars!: number;

  @ApiProperty({ type: 'integer' })
  count!: number;
}

export class ReviewSummaryDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Average of published reviews rounded to one decimal; null when there are none ("New — no reviews").',
    example: 4.5,
  })
  ratingAvg!: number | null;

  @ApiProperty({ type: 'integer' })
  ratingCount!: number;

  @ApiProperty({
    type: RatingBucketDto,
    isArray: true,
    description: 'Count per star, always 5 entries, 5 → 1.',
  })
  distribution!: RatingBucketDto[];
}

export class ReviewReportDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  reviewId!: string;

  @ApiProperty({ enum: ReportReason, enumName: 'ReportReason' })
  reason!: ReportReason;

  @ApiProperty({ enum: ReportStatus, enumName: 'ReportStatus' })
  status!: ReportStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

/** Service-level page shape; ResponseInterceptor turns it into
 * `{data: items, meta: {nextCursor}}`. */
export interface ReviewPage {
  items: PublicReviewDto[];
  nextCursor: string | null;
}
