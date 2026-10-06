import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  POST_CONTENT_CLASSES,
  type PostContentClass,
} from '../posts/content-filter.service';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AdminIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class AdminListQueryDto {
  @ApiPropertyOptional({ description: 'Search text.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

/** Owner 2026-10-04 (bulk moderation): narrow a moderation list to one
 * author and / or a time window, so a whole batch can be selected. */
export class AdminContentFilterQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Only this author.' })
  @IsOptional()
  @IsUUID('all')
  authorId?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Created at or after (inclusive).',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Created before (exclusive).',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class AdminPostsQueryDto extends AdminContentFilterQueryDto {
  @ApiPropertyOptional({ enum: ['post', 'news'], enumName: 'AdminPostKind' })
  @IsOptional()
  @IsIn(['post', 'news'])
  kind?: 'post' | 'news';

  @ApiPropertyOptional({
    enum: ['video'],
    description: 'Only posts that carry a video (the former "reels")',
  })
  @IsOptional()
  @IsIn(['video'])
  media?: 'video';

  /** Owner 2026-10-05: legal or general (personal) posts only. */
  @ApiPropertyOptional({
    enum: POST_CONTENT_CLASSES,
    enumName: 'PostContentClass',
  })
  @IsOptional()
  @IsIn(POST_CONTENT_CLASSES)
  contentClass?: PostContentClass;
}

export const ADMIN_POST_CLASS_ACTIONS = ['legal', 'general', 'auto'] as const;
export type AdminPostClassAction = (typeof ADMIN_POST_CLASS_ACTIONS)[number];

/** Owner 2026-10-05: moderation reclassifies posts. legal / general sticks
 * (the author's edits no longer change it); auto = back to the topic rule. */
export class AdminClassifyPostsDto {
  @ApiProperty({ type: [String], format: 'uuid', maxItems: 200 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[];

  @ApiProperty({
    enum: ADMIN_POST_CLASS_ACTIONS,
    enumName: 'AdminPostClassAction',
  })
  @IsIn(ADMIN_POST_CLASS_ACTIONS)
  contentClass!: AdminPostClassAction;
}

export class AdminCommentsQueryDto extends AdminContentFilterQueryDto {
  @ApiPropertyOptional({
    enum: ['post', 'case'],
    enumName: 'AdminCommentThread',
    default: 'post',
  })
  @IsOptional()
  @IsIn(['post', 'case'])
  thread?: 'post' | 'case';
}

export class AdminBidsQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({
    enum: [
      'active',
      'accepted',
      'rejected_by_client',
      'rejected_auto',
      'withdrawn',
      'failed_negotiation',
    ],
    enumName: 'AdminBidStatus',
  })
  @IsOptional()
  @IsIn([
    'active',
    'accepted',
    'rejected_by_client',
    'rejected_auto',
    'withdrawn',
    'failed_negotiation',
  ])
  status?: string;
}

export class AdminRemoveDto {
  @ApiPropertyOptional({ type: String, maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason = '';
}

export class AdminRemoveCommentDto extends AdminRemoveDto {
  @ApiProperty({ enum: ['post', 'case'], enumName: 'AdminCommentThread' })
  @IsIn(['post', 'case'])
  thread!: 'post' | 'case';
}

export class AdminPostRowDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['post', 'news'] }) kind!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) title!: string | null;
  @ApiProperty() body!: string;
  @ApiProperty() authorId!: string;
  @ApiProperty() authorName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) practice!:
    string | null;
  @ApiProperty({ enum: ['published', 'hidden', 'removed'] }) status!: string;
  @ApiProperty({ enum: POST_CONTENT_CLASSES, enumName: 'PostContentClass' })
  contentClass!: PostContentClass;
  @ApiProperty({ description: 'Set by moderation (author edits keep it).' })
  contentClassLocked!: boolean;
  @ApiProperty({ type: 'integer' }) likes!: number;
  @ApiProperty({ type: 'integer' }) comments!: number;
  @ApiProperty() deleted!: boolean;
  @ApiProperty({ description: 'The post carries a video' }) hasVideo!: boolean;
  @ApiProperty({ type: 'integer', description: 'Documents (PDF, Word…)' })
  attachments!: number;
  @ApiProperty({ type: 'integer' }) photos!: number;
  @ApiProperty() createdAt!: string;
}

export class AdminCommentRowDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['post', 'case'] }) thread!: string;
  @ApiProperty({ format: 'uuid' }) targetId!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) targetTitle!:
    string | null;
  @ApiProperty() body!: string;
  @ApiProperty() authorId!: string;
  @ApiProperty() authorName!: string;
  @ApiProperty({ enum: ['published', 'hidden', 'removed'] }) status!: string;
  @ApiProperty() deleted!: boolean;
  @ApiProperty() createdAt!: string;
}

export class AdminReviewRowDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: 'integer' }) rating!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) body!: string | null;
  @ApiProperty({ format: 'uuid' }) attorneyId!: string;
  @ApiProperty() attorneyName!: string;
  /** The review's author. */
  @ApiProperty({ format: 'uuid' }) clientId!: string;
  @ApiProperty() clientName!: string;
  /** null = an open review (no shared case, owner 2026-10-01). */
  @ApiPropertyOptional({ type: String, nullable: true })
  caseTitle!: string | null;
  @ApiProperty({ enum: ['published', 'hidden', 'removed'] }) status!: string;
  @ApiProperty() createdAt!: string;
}

export class AdminBidRowDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() caseId!: string;
  @ApiProperty() caseTitle!: string;
  @ApiProperty() attorneyName!: string;
  @ApiProperty() status!: string;
  @ApiProperty() feeType!: string;
  @ApiProperty({ type: 'integer' }) amountCents!: number;
  @ApiProperty({ type: 'integer' }) rounds!: number;
  @ApiProperty() outsidePractice!: boolean;
  @ApiProperty() createdAt!: string;
}

export class AdminPracticeAreaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() nameEn!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) parentCode!:
    string | null;
  @ApiProperty({ type: 'integer' }) sort!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: 'integer' }) attorneys!: number;
  @ApiProperty({ type: 'integer' }) cases!: number;
  @ApiProperty({ type: 'integer' }) posts!: number;
}

export class UpdatePracticeAreaDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nameEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: 'integer' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  sort?: number;
}

export class CreatePracticeAreaDto {
  @ApiProperty({ example: 'family_law.surrogacy' })
  @Matches(/^[a-z0-9_]+(\.[a-z0-9_]+)?$/)
  @MaxLength(120)
  code!: string;

  @ApiProperty({ maxLength: 120 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nameEn!: string;
}

export const BROADCAST_AUDIENCES = [
  'all',
  'attorneys',
  'clients',
  'assistants',
] as const;

export class CreateBroadcastDto {
  @ApiProperty({ maxLength: 120 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @ApiProperty({ maxLength: 1000 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  body!: string;

  @ApiProperty({ enum: BROADCAST_AUDIENCES, enumName: 'BroadcastAudience' })
  @IsIn(BROADCAST_AUDIENCES)
  audience!: (typeof BROADCAST_AUDIENCES)[number];

  @ApiPropertyOptional({
    example: 'IL',
    description: 'Only this state (older clients; prefer stateCodes).',
  })
  @IsOptional()
  @Matches(/^[A-Z0-9]{2}$/)
  stateCode?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['IL', 'NY', 'CA'],
    maxItems: 60,
    description:
      'Owner 2026-10-04: only these states (empty or missing = every state). Wins over stateCode.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @Matches(/^[A-Z0-9]{2}$/, { each: true })
  stateCodes?: string[];
}

export class BroadcastDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty() audience!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) stateCode!:
    string | null;
  @ApiProperty({
    type: [String],
    description: 'The chosen states (empty = every state).',
  })
  stateCodes!: string[];
  @ApiProperty({ type: 'integer' }) recipients!: number;
  @ApiProperty() createdAt!: string;
}

export const EXPORT_ENTITIES = [
  'users',
  'cases',
  'bids',
  'payments',
  'case_payments',
  'posts',
  'teams',
] as const;

export class ExportParamDto {
  @ApiProperty({ enum: EXPORT_ENTITIES, enumName: 'ExportEntity' })
  @IsIn(EXPORT_ENTITIES)
  entity!: (typeof EXPORT_ENTITIES)[number];
}

export class AdminOverviewDto {
  @ApiProperty({ type: 'integer' }) clients!: number;
  @ApiProperty({ type: 'integer' }) attorneys!: number;
  @ApiProperty({ type: 'integer' }) attorneysVerified!: number;
  @ApiProperty({ type: 'integer' }) assistants!: number;
  @ApiProperty({ type: 'integer' }) subscriptionsMonthly!: number;
  @ApiProperty({ type: 'integer' }) subscriptionsYearly!: number;
  @ApiProperty({ type: 'integer' }) assistantSeats!: number;
  @ApiProperty({ type: 'integer' }) revenue30dCents!: number;
  @ApiProperty({ type: 'integer' }) cases7d!: number;
  @ApiProperty({ type: 'integer' }) bids7d!: number;
  @ApiProperty({ type: 'integer' }) posts7d!: number;
  @ApiProperty({ type: 'integer' }) messages7d!: number;
  @ApiProperty({ type: 'integer' }) calls7d!: number;
  @ApiProperty({ type: 'integer' }) callsMissed7d!: number;
  @ApiProperty({ type: 'integer' }) tasksOpen!: number;
  @ApiProperty({ type: 'integer' }) tasksDone30d!: number;
  @ApiProperty({ type: 'integer' }) requestsPending!: number;
}

// --- Audit 2026-10-02: restore, client reviews --------------------------------

/** A moderation reason for the audit log (10–500 characters). */
export class AdminReasonDto {
  @ApiPropertyOptional({ type: String, maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason = '';
}

export class AdminClientReviewsQueryDto extends AdminContentFilterQueryDto {
  @ApiPropertyOptional({
    enum: ['published', 'hidden', 'removed'],
    enumName: 'AdminReviewStatus',
  })
  @IsOptional()
  @IsIn(['published', 'hidden', 'removed'])
  status?: 'published' | 'hidden' | 'removed';
}

export class AdminClientReviewRowDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: 'integer' }) rating!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) body!: string | null;
  @ApiProperty({ format: 'uuid' }) authorId!: string;
  @ApiProperty() authorName!: string;
  @ApiProperty({ enum: ['attorney', 'client', 'assistant'] })
  authorRole!: string;
  @ApiProperty({ format: 'uuid' }) clientId!: string;
  @ApiProperty() clientName!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  caseTitle!: string | null;
  @ApiProperty({ enum: ['published', 'hidden', 'removed'] }) status!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    enum: ['pending', 'accepted', 'rejected', 'auto_removed'],
    description: "The reviewed client's appeal, if any.",
  })
  appealStatus!: string | null;
  @ApiProperty() createdAt!: string;
}

// --- Owner 2026-10-04: bulk moderation ---------------------------------------

export const BULK_MAX = 500;

export const BULK_CONTENT_TYPES = [
  'post',
  'comment',
  'case_comment',
  'review',
  'client_review',
] as const;
export type BulkContentType = (typeof BULK_CONTENT_TYPES)[number];

export const BULK_CONTENT_ACTIONS = ['remove', 'hide', 'restore'] as const;
export type BulkContentAction = (typeof BULK_CONTENT_ACTIONS)[number];

/** Many ids and one reason (10–500 characters, same as single actions). */
export class AdminBulkReasonDto extends AdminReasonDto {
  @ApiProperty({ type: [String], format: 'uuid', maxItems: BULK_MAX })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BULK_MAX)
  @IsUUID('all', { each: true })
  ids!: string[];
}

export class AdminBulkContentDto extends AdminBulkReasonDto {
  @ApiProperty({
    enum: BULK_CONTENT_ACTIONS,
    enumName: 'AdminBulkContentAction',
    description:
      'remove: posts and comments (the author is told why); hide: any type (the author is told why); restore: back to visible.',
  })
  @IsIn(BULK_CONTENT_ACTIONS)
  action!: BulkContentAction;

  @ApiProperty({ enum: BULK_CONTENT_TYPES, enumName: 'AdminBulkContentType' })
  @IsIn(BULK_CONTENT_TYPES)
  type!: BulkContentType;
}

export class AdminBulkSkippedDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['not_found', 'invalid_state', 'failed'] })
  reason!: string;
}

export class AdminBulkResultDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  done!: string[];

  @ApiProperty({
    type: [AdminBulkSkippedDto],
    description: 'Ids that were missing or not in a state to change.',
  })
  skipped!: AdminBulkSkippedDto[];
}
