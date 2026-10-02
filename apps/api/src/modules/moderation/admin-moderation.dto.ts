import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const REPORT_TARGET_TYPES = [
  'post',
  'comment',
  'case_comment',
  'message',
  'user',
  'case',
  'review',
  // Owner 2026-10-01: reviews of clients and assistants.
  'client_review',
  // Owner 2026-10-02: user sticker packs.
  'sticker_pack',
] as const;
export type ReportTargetName = (typeof REPORT_TARGET_TYPES)[number];

export const MODERATION_ACTIONS = [
  'hide',
  'remove',
  'warn',
  'suspend',
  'restore',
  'dismiss',
] as const;
export type ModerationActionName = (typeof MODERATION_ACTIONS)[number];

export class ModerationQueueQueryDto {
  @ApiPropertyOptional({
    enum: ['open', 'actioned', 'dismissed'],
    default: 'open',
  })
  @IsOptional()
  @IsIn(['open', 'actioned', 'dismissed'])
  status?: 'open' | 'actioned' | 'dismissed';

  @ApiPropertyOptional({ enum: REPORT_TARGET_TYPES })
  @IsOptional()
  @IsIn(REPORT_TARGET_TYPES)
  targetType?: ReportTargetName;

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

export class ModerationTargetParamDto {
  @ApiProperty({ enum: REPORT_TARGET_TYPES })
  @IsIn(REPORT_TARGET_TYPES)
  type!: ReportTargetName;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class ModerationActionDto {
  @ApiProperty({ enum: MODERATION_ACTIONS })
  @IsIn(MODERATION_ACTIONS)
  action!: ModerationActionName;

  @ApiProperty({
    maxLength: 500,
    description: 'Required for every action (§3.2).',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

// ---- responses ----------------------------------------------------------

export class ModerationAuthorDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, nullable: true }) role!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty({ type: String, nullable: true }) firstName!: string | null;
  @ApiProperty({ type: String, nullable: true }) lastName!: string | null;
  @ApiProperty({ type: String, nullable: true }) username!: string | null;
  @ApiProperty({ type: 'integer' }) warnings!: number;
  @ApiProperty({ type: 'integer' }) suspensions!: number;
}

export class ModerationQueueItemDto {
  @ApiProperty({ enum: REPORT_TARGET_TYPES }) targetType!: ReportTargetName;
  @ApiProperty({ format: 'uuid' }) targetId!: string;
  @ApiProperty({ type: 'integer' }) reports!: number;
  @ApiProperty({ type: 'integer' }) reporters!: number;
  @ApiProperty({ type: [String] }) reasons!: string[];
  @ApiProperty({ format: 'date-time' }) firstReportedAt!: string;
  @ApiProperty({ format: 'date-time' }) lastReportedAt!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Current object status (hidden = auto-hidden or moderated).',
  })
  targetStatus!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'First 200 characters.',
  })
  excerpt!: string | null;
  @ApiProperty({ type: ModerationAuthorDto, nullable: true })
  author!: ModerationAuthorDto | null;
}

export interface ModerationQueuePage {
  items: ModerationQueueItemDto[];
  nextCursor: string | null;
}

export class ModerationReportDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) reporterId!: string;
  @ApiProperty() reason!: string;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  handledAt!: string | null;
}

export class ModerationHistoryItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() action!: string;
  @ApiProperty() targetType!: string;
  @ApiProperty({ format: 'uuid' }) targetId!: string;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class ModerationCardDto {
  @ApiProperty({ enum: REPORT_TARGET_TYPES }) targetType!: ReportTargetName;
  @ApiProperty({ format: 'uuid' }) targetId!: string;
  @ApiProperty({ type: String, nullable: true }) status!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Full text / title+description; null for a user.',
  })
  text!: string | null;
  @ApiProperty({
    type: Object,
    description: 'postId, conversationId, attorneyId …',
  })
  context!: Record<string, string | null>;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  createdAt!: string | null;
  @ApiProperty({ type: ModerationAuthorDto, nullable: true })
  author!: ModerationAuthorDto | null;
  @ApiProperty({ type: [ModerationReportDto] }) reports!: ModerationReportDto[];
  @ApiProperty({
    type: [ModerationHistoryItemDto],
    description: "Author's past sanctions and content actions.",
  })
  authorHistory!: ModerationHistoryItemDto[];
  @ApiProperty({
    type: [String],
    enum: MODERATION_ACTIONS,
    description: 'Actions that apply to this object now.',
  })
  availableActions!: ModerationActionName[];
}

export class ModerationActionResultDto {
  @ApiProperty({ enum: REPORT_TARGET_TYPES }) targetType!: ReportTargetName;
  @ApiProperty({ format: 'uuid' }) targetId!: string;
  @ApiProperty({ enum: MODERATION_ACTIONS }) action!: ModerationActionName;
  @ApiProperty({ type: String, nullable: true }) status!: string | null;
  @ApiProperty({
    type: 'integer',
    description: 'Open reports closed by this action.',
  })
  reportsHandled!: number;
}
