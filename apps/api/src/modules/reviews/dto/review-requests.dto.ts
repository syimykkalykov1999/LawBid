import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportReason } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/** docs/03 §7.2 / docs/02 §6.1: text ≤ 1000 characters (CHECK in DB). */
export const REVIEW_BODY_MAX = 1000;
/** Free-text note of a report. docs/02 leaves it unbounded; capped so a
 * report can't carry an arbitrarily large blob into the moderation queue. */
export const REPORT_NOTE_MAX = 500;
export const REVIEWS_PAGE_DEFAULT = 20;
export const REVIEWS_PAGE_MAX = 50;

/** Trim; an empty text is stored as "no text". */
const trimToNull = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export class CaseIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  caseId!: string;
}

export class ReviewIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class AttorneyIdParamDto {
  @ApiProperty({ format: 'uuid', description: 'Attorney user id.' })
  @IsUUID('all')
  id!: string;
}

export class CreateReviewDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: REVIEW_BODY_MAX,
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(REVIEW_BODY_MAX)
  body?: string | null;
}

/** At least one field; `body: null` (or "") clears the text. */
export class UpdateReviewDto {
  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: REVIEW_BODY_MAX,
  })
  @Transform(trimToNull)
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(REVIEW_BODY_MAX)
  body?: string | null;
}

export class ReportReviewDto {
  @ApiProperty({ enum: ReportReason, enumName: 'ReportReason' })
  @IsEnum(ReportReason)
  reason!: ReportReason;

  @ApiPropertyOptional({ maxLength: REPORT_NOTE_MAX })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(REPORT_NOTE_MAX)
  note?: string | null;
}

export class ListReviewsQueryDto {
  @ApiPropertyOptional({
    description: 'meta.nextCursor of the previous page.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: REVIEWS_PAGE_MAX,
    default: REVIEWS_PAGE_DEFAULT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(REVIEWS_PAGE_MAX)
  limit?: number;
}
