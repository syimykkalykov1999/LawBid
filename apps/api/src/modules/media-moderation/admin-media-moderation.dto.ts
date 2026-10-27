import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

const LIST_STATUSES = [
  'all',
  'flagged',
  'hidden',
  'csam_match',
  'skipped',
] as const;

export class MediaModerationQueryDto {
  @ApiPropertyOptional({
    enum: LIST_STATUSES,
    enumName: 'MediaCheckListStatus',
    default: 'all',
  })
  @IsOptional()
  @IsIn(LIST_STATUSES)
  status?: (typeof LIST_STATUSES)[number];

  @ApiPropertyOptional({ description: 'created_at of the last row seen' })
  @IsOptional()
  @IsISO8601()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class MediaCheckIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;
}

export class MediaDecisionDto {
  @ApiProperty({ enum: ['approve', 'remove'] })
  @IsIn(['approve', 'remove'])
  decision!: 'approve' | 'remove';
}

export class MediaLabelDto {
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) parent!: string | null;
  @ApiProperty() confidence!: number;
}

export class MediaHiddenTargetDto {
  @ApiProperty({
    enum: [
      'post',
      'story',
      'channel_post',
      'review',
      'client_review',
      'avatar',
    ],
  })
  type!: string;
  @ApiProperty({ format: 'uuid' }) id!: string;
}

export class MediaCheckDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  fileId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  videoAssetId!: string | null;
  @ApiProperty({ format: 'uuid' }) ownerUserId!: string;
  @ApiProperty({ description: 'File purpose, or reel' }) purpose!: string;
  @ApiProperty({
    enum: [
      'pending',
      'clean',
      'flagged',
      'hidden',
      'csam_match',
      'skipped',
      'error',
    ],
  })
  status!: string;
  @ApiProperty({ enum: ['not_checked', 'not_configured', 'no_match', 'match'] })
  csamStatus!: string;
  @ApiProperty({ type: String, nullable: true }) provider!: string | null;
  @ApiProperty({ type: [MediaLabelDto] }) labels!: MediaLabelDto[];
  @ApiProperty({ type: Number, nullable: true })
  maxConfidence!: number | null;
  @ApiProperty({ type: String, nullable: true }) topLabel!: string | null;
  @ApiProperty({ type: String, nullable: true }) skipReason!: string | null;
  @ApiProperty({ type: [MediaHiddenTargetDto] })
  hiddenTargets!: MediaHiddenTargetDto[];
  @ApiProperty({ type: String, nullable: true, enum: ['approved', 'removed'] })
  decision!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Signed 5-minute preview; never for a CSAM match',
  })
  previewUrl!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: String, nullable: true }) checkedAt!: string | null;
}

export class MediaCheckPageDto {
  @ApiProperty({ type: [MediaCheckDto] }) items!: MediaCheckDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}

export class CsamAuditEventDto {
  @ApiProperty({ format: 'date-time' }) at!: string;
  @ApiProperty({
    description:
      'opened | submit_skipped | submitted | manual_required | failed',
  })
  event!: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  actor!: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true })
  detail!: Record<string, unknown>;
}

export class CsamReportDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) checkId!: string;
  @ApiProperty({
    enum: ['pending', 'submitted', 'manual_required', 'failed'],
  })
  status!: string;
  @ApiProperty({ type: String, nullable: true })
  externalReportId!: string | null;
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
  @ApiProperty({
    type: [CsamAuditEventDto],
    description:
      'Owner 2026-10-28: append-only trail of this report (who opened it, whether the NCMEC call was made).',
  })
  audit!: CsamAuditEventDto[];
  @ApiProperty() createdAt!: string;
}
