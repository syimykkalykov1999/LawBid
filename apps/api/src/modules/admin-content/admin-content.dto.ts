import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

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

export class AdminPostsQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ enum: ['post', 'news'], enumName: 'AdminPostKind' })
  @IsOptional()
  @IsIn(['post', 'news'])
  kind?: 'post' | 'news';
}

export class AdminCommentsQueryDto extends AdminListQueryDto {
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
  @ApiProperty({ maxLength: 500 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
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
  @ApiProperty({ type: 'integer' }) likes!: number;
  @ApiProperty({ type: 'integer' }) comments!: number;
  @ApiProperty() deleted!: boolean;
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
  @ApiProperty() attorneyName!: string;
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

  @ApiPropertyOptional({ example: 'IL', description: 'Only this state.' })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  stateCode?: string;
}

export class BroadcastDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty() audience!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) stateCode!:
    string | null;
  @ApiProperty({ type: 'integer' }) recipients!: number;
  @ApiProperty() createdAt!: string;
}

export const EXPORT_ENTITIES = [
  'users',
  'cases',
  'bids',
  'payments',
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
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class AdminClientReviewsQueryDto extends AdminListQueryDto {
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
