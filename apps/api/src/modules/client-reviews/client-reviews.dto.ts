import { ReviewPhotoDto } from '../reviews/dto/review-responses.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const CLIENT_REVIEW_BODY_MAX = 2000;

/** PUT /cases/:id/client-review (OQ-038). */
export class UpsertClientReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ maxLength: CLIENT_REVIEW_BODY_MAX })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(CLIENT_REVIEW_BODY_MAX)
  body?: string;

  /** Owner 2026-10-01 (Google Maps-style): up to 10 `review_photo` files. */
  @ApiPropertyOptional({ type: [String], maxItems: 10 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  photoIds?: string[];
}

/** Owner 2026-09-30: POST /client-reviews/:id/appeal. */
export class AppealClientReviewDto {
  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;
}

export class ClientReviewIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class ClientIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class ClientReviewsQueryDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 5,
    description: 'Only reviews with this star rating (tap on the bar).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({
    enum: ['relevant', 'newest', 'oldest', 'highest', 'lowest', 'helpful'],
    enumName: 'ClientReviewsSort',
    default: 'newest',
  })
  @IsOptional()
  @IsIn(['relevant', 'newest', 'oldest', 'highest', 'lowest', 'helpful'])
  sort?: 'relevant' | 'newest' | 'oldest' | 'highest' | 'lowest' | 'helpful';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

export class ClientReviewAuthorDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty()
  displayName!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  avatarUrl!: string | null;

  @ApiProperty()
  verifiedBadge!: boolean;

  /** Owner 2026-09-30: attorneys and clients review clients. */
  @ApiProperty({ enum: ['attorney', 'client', 'assistant'] })
  role!: 'attorney' | 'client' | 'assistant';
}

export class ClientReviewDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  /** Null for a review written without a shared case. */
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  caseId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  caseTitle!: string | null;

  @ApiProperty({ type: 'integer' })
  rating!: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  body!: string | null;

  @ApiProperty({ type: ClientReviewAuthorDto })
  attorney!: ClientReviewAuthorDto;

  @ApiProperty()
  isMine!: boolean;

  /** Deprecated (owner 2026-10-01, Google-style): always false — the
   * reviewed person replies or flags the review instead. */
  @ApiProperty()
  canAppeal!: boolean;

  // Owner 2026-10-01 (Google-style).
  @ApiProperty({
    description: 'The viewer is the reviewed person (may reply).',
  })
  canReply!: boolean;

  @ApiProperty({ type: String, nullable: true })
  reply!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  replyAt!: string | null;

  @ApiProperty({ type: 'integer' })
  helpfulCount!: number;

  @ApiProperty()
  helpfulByMe!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  editedAt!: string | null;

  @ApiProperty({ type: () => ReviewPhotoDto, isArray: true })
  photos!: ReviewPhotoDto[];

  @ApiProperty({ type: 'integer', description: 'Reviews this author wrote.' })
  authorReviewCount!: number;

  /** Owner 2026-09-30: the appeal's state — shown to the client and the
   * author only (null for others or without an appeal). */
  @ApiPropertyOptional({
    enum: ['pending', 'accepted', 'rejected', 'auto_removed'],
    enumName: 'ReviewAppealStatus',
    nullable: true,
  })
  appealStatus!: 'pending' | 'accepted' | 'rejected' | 'auto_removed' | null;

  @ApiProperty()
  createdAt!: string;
}

/** Admin: one appeal in the queue. */
export class AdminReviewAppealDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    enum: ['pending', 'accepted', 'rejected', 'auto_removed'],
    enumName: 'ReviewAppealStatus',
  })
  status!: 'pending' | 'accepted' | 'rejected' | 'auto_removed';

  @ApiProperty()
  reason!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty({ description: 'Removed automatically then unless decided.' })
  autoRemoveAt!: string;

  @ApiProperty({ format: 'uuid' })
  reviewId!: string;

  @ApiProperty({ type: 'integer' })
  rating!: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  body!: string | null;

  @ApiProperty()
  authorName!: string;

  @ApiProperty({ enum: ['attorney', 'client', 'assistant'] })
  authorRole!: 'attorney' | 'client' | 'assistant';

  @ApiProperty({ format: 'uuid' })
  clientId!: string;

  @ApiProperty()
  clientName!: string;
}

export class AdminReviewAppealsQueryDto {
  @ApiPropertyOptional({
    enum: ['pending', 'accepted', 'rejected', 'auto_removed'],
    enumName: 'ReviewAppealStatus',
    default: 'pending',
  })
  @IsOptional()
  @IsIn(['pending', 'accepted', 'rejected', 'auto_removed'])
  status?: 'pending' | 'accepted' | 'rejected' | 'auto_removed';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

/** Admin: accept (remove the reviews) or reject (keep them), in bulk. */
export class AdminReviewAppealsDecisionDto {
  @ApiProperty({ type: [String], maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  ids!: string[];

  @ApiProperty({ enum: ['accept', 'reject'] })
  @IsIn(['accept', 'reject'])
  decision!: 'accept' | 'reject';

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AdminReviewAppealsDecisionResultDto {
  @ApiProperty({ type: 'integer' })
  decided!: number;
}

export interface ClientReviewPage {
  items: ClientReviewDto[];
  nextCursor: string | null;
}

export class ClientReviewReportDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() status!: string;
}
