import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
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
import {
  REPORT_TARGET_TYPES,
  type ReportTargetName,
} from './admin-moderation.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const APPEAL_STATUSES = ['pending', 'accepted', 'rejected'] as const;
export type AppealStatusName = (typeof APPEAL_STATUSES)[number];

/** Owner 2026-10-20: a decision on my content, as I see it. */
export class ModerationNoticeDto {
  @ApiProperty({ format: 'uuid', description: 'moderation_actions.id' })
  actionId!: string;
  @ApiProperty({ enum: ['hide', 'remove', 'warn', 'restore'] })
  action!: string;
  @ApiProperty({ enum: REPORT_TARGET_TYPES }) targetType!: ReportTargetName;
  @ApiProperty({ format: 'uuid' }) targetId!: string;
  @ApiProperty({ type: String, nullable: true })
  reason!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Text excerpt.' })
  excerpt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({
    description:
      'hide / remove of content that is still hidden, within 30 days, not yet appealed.',
  })
  canAppeal!: boolean;
  @ApiProperty({ enum: APPEAL_STATUSES, nullable: true, type: String })
  appealStatus!: AppealStatusName | null;
  @ApiProperty({ type: String, nullable: true })
  appealNote!: string | null;
}

export class CreateAppealDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  actionId!: string;

  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  message!: string;
}

export class MyReportDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: REPORT_TARGET_TYPES }) targetType!: ReportTargetName;
  @ApiProperty() reason!: string;
  @ApiProperty({ enum: ['open', 'actioned', 'dismissed'] }) status!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AppealQueueQueryDto {
  @ApiPropertyOptional({ enum: APPEAL_STATUSES, default: 'pending' })
  @IsOptional()
  @IsIn(APPEAL_STATUSES)
  status?: AppealStatusName;

  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 50,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class AppealItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: APPEAL_STATUSES }) status!: AppealStatusName;
  @ApiProperty({ enum: REPORT_TARGET_TYPES }) targetType!: ReportTargetName;
  @ApiProperty({ format: 'uuid' }) targetId!: string;
  @ApiProperty({ enum: ['hide', 'remove'] }) action!: string;
  @ApiProperty({ type: String, nullable: true }) actionReason!: string | null;
  @ApiProperty() message!: string;
  @ApiProperty({ type: String, nullable: true }) excerpt!: string | null;
  @ApiProperty({ type: String, nullable: true }) targetStatus!: string | null;
  @ApiProperty({ format: 'uuid' }) appellantId!: string;
  @ApiProperty({ type: String, nullable: true }) appellantName!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  decidedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) decisionNote!: string | null;
}

export class AppealIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class AppealDecisionDto {
  @ApiProperty({
    description: 'true = restore the content; false = keep the decision.',
  })
  @IsBoolean()
  accept!: boolean;

  @ApiProperty({
    minLength: 1,
    maxLength: 500,
    description: 'Shown to the author.',
  })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  note!: string;
}

export class JournalQueryDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class JournalItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() action!: string;
  @ApiProperty({ enum: REPORT_TARGET_TYPES }) targetType!: ReportTargetName;
  @ApiProperty({ format: 'uuid' }) targetId!: string;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ format: 'uuid' }) adminId!: string;
  @ApiProperty({ type: String, nullable: true }) adminName!: string | null;
  @ApiProperty({ enum: APPEAL_STATUSES, nullable: true, type: String })
  appealStatus!: AppealStatusName | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AppealDecisionResultDto {
  @ApiProperty({ enum: ['accepted', 'rejected'] }) status!: AppealStatusName;
}
