import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  PROMOTION_STATUSES,
  PROMOTION_TARGETS,
  type PromotionStatus,
  type PromotionTarget,
} from './promotions.settings';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// ---- app --------------------------------------------------------------

export class PromotionCaseIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class PromotionPostIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class PromotionIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class PromotionQuoteQueryDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 365 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;

  @ApiPropertyOptional({
    type: 'integer',
    description: 'Owner 2026-10-05: daily budget; default from the admin.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  dailyBudgetCents?: number;

  @ApiPropertyOptional({
    enum: PROMOTION_TARGETS,
    enumName: 'PromotionTarget',
    default: 'case',
  })
  @IsOptional()
  @IsIn(PROMOTION_TARGETS)
  target?: PromotionTarget;
}

/** Owner 2026-10-05: who sees a promoted post (empty = everyone). */
export class PromotionAudienceDto {
  @ApiProperty({ enum: ['all', 'attorneys', 'clients'], default: 'all' })
  @IsIn(['all', 'attorneys', 'clients'])
  role!: 'all' | 'attorneys' | 'clients';

  @ApiProperty({ type: [String], description: 'US state codes.' })
  @IsArray()
  @ArrayMaxSize(60)
  @Matches(/^[A-Z]{2}$/, { each: true })
  states!: string[];

  @ApiProperty({ type: [String], description: 'Country codes.' })
  @IsArray()
  @ArrayMaxSize(50)
  @Matches(/^[A-Z]{2}$/, { each: true })
  countries!: string[];

  @ApiProperty({ type: [String], description: 'Practice category codes.' })
  @IsArray()
  @ArrayMaxSize(30)
  @Matches(/^[a-z0-9_]{1,40}$/, { each: true })
  topics!: string[];
}

export class CreatePromotionDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 365 })
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;

  @ApiPropertyOptional({
    type: 'integer',
    description: 'Owner 2026-10-05: daily budget; default from the admin.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  dailyBudgetCents?: number;

  @ApiPropertyOptional({ type: PromotionAudienceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PromotionAudienceDto)
  audience?: PromotionAudienceDto;

  @ApiPropertyOptional({
    default: true,
    description: 'Spend free days earned through referrals first.',
  })
  @IsOptional()
  @IsBoolean()
  useCredits?: boolean;

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  promoCode?: string;
}

export class PromotionQuoteDto {
  @ApiProperty({ type: 'integer' })
  days!: number;

  @ApiProperty({ type: 'integer' })
  priceCentsPerDay!: number;

  @ApiProperty({ type: 'integer', description: 'days × price per day.' })
  grossCents!: number;

  @ApiProperty({ type: 'integer', description: 'If credits are used.' })
  totalCents!: number;

  @ApiProperty({ type: 'integer', description: 'Whole credit days.' })
  creditDaysAvailable!: number;

  @ApiProperty({ type: 'integer', description: 'Whole credit days.' })
  creditDaysUsed!: number;

  @ApiProperty({
    type: 'number',
    description:
      'Referral credit days, exact (owner 2026-10-05: may be fractional, 0.5 = 12 hours).',
  })
  creditDaysAvailableExact!: number;

  @ApiProperty({ type: 'number', description: 'Credit days used, exact.' })
  creditDaysUsedExact!: number;

  @ApiProperty({ type: 'integer' })
  maxDays!: number;

  @ApiProperty({ description: 'This target can be promoted (admin switch).' })
  enabled!: boolean;

  // ---- owner 2026-10-05: Instagram-style budget and reach ----
  @ApiProperty({ type: 'integer' })
  dailyBudgetCents!: number;

  @ApiProperty({ type: 'integer' })
  minDailyBudgetCents!: number;

  @ApiProperty({ type: 'integer' })
  maxDailyBudgetCents!: number;

  @ApiProperty({ type: 'integer', isArray: true })
  budgetPresetsCents!: number[];

  @ApiProperty({ type: 'integer', isArray: true })
  durationPresets!: number[];

  @ApiProperty({ type: 'integer', description: 'Price of 1 000 impressions.' })
  cpmCents!: number;

  @ApiProperty({ type: 'integer' })
  estImpressions!: number;

  @ApiProperty({ type: 'integer' })
  estReachMin!: number;

  @ApiProperty({ type: 'integer' })
  estReachMax!: number;

  @ApiProperty()
  postsEnabled!: boolean;

  @ApiProperty()
  casesEnabled!: boolean;
}

export class CasePromotionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: PROMOTION_TARGETS, enumName: 'PromotionTarget' })
  targetType!: PromotionTarget;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  caseId!: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  postId!: string | null;

  @ApiProperty({ enum: PROMOTION_STATUSES, enumName: 'CasePromotionStatus' })
  status!: PromotionStatus;

  @ApiProperty({ type: 'integer' })
  days!: number;

  @ApiProperty({ type: 'integer' })
  priceCentsPerDay!: number;

  @ApiProperty({ type: 'integer', description: 'Charged amount.' })
  totalCents!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  startsAt!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  endsAt!: string | null;

  @ApiProperty({ type: 'integer' })
  impressions!: number;

  @ApiProperty({ type: 'integer', description: 'Distinct people reached.' })
  reach!: number;

  @ApiProperty({ type: 'integer' })
  clicks!: number;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    description: 'Impressions the budget buys (null = no cap).',
  })
  targetImpressions!: number | null;

  @ApiPropertyOptional({ type: PromotionAudienceDto, nullable: true })
  audience!: PromotionAudienceDto | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  cancelReason!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

/** A row of "My promotions" (owner 2026-10-05). */
export class MyPromotionDto extends CasePromotionDto {
  @ApiProperty({ description: 'Case title / post title or text start.' })
  title!: string;
}

export class MyPromotionsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

export class PromotionClickResultDto {
  @ApiProperty()
  ok!: boolean;
}

export class CasePromotionStateDto {
  @ApiPropertyOptional({
    type: CasePromotionDto,
    nullable: true,
    description: 'Active / pending one, else the latest.',
  })
  promotion!: CasePromotionDto | null;

  @ApiProperty({ description: 'The case / post can be promoted now.' })
  canPromote!: boolean;

  @ApiProperty({ type: PromotionQuoteDto, description: 'Quote for 1 day.' })
  quote!: PromotionQuoteDto;
}

export class CreatePromotionResultDto {
  @ApiProperty({ format: 'uuid' })
  promotionId!: string;

  @ApiProperty({ enum: PROMOTION_STATUSES, enumName: 'CasePromotionStatus' })
  status!: PromotionStatus;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Open in the browser to pay; null when nothing to pay.',
  })
  checkoutUrl!: string | null;

  @ApiProperty({ type: 'integer' })
  totalCents!: number;

  @ApiProperty({ type: 'integer', description: 'Whole credit days.' })
  creditDaysUsed!: number;

  @ApiProperty({
    type: 'number',
    description: 'Credit days used, exact (may be fractional).',
  })
  creditDaysUsedExact!: number;

  @ApiProperty({ type: CasePromotionDto })
  promotion!: CasePromotionDto;
}

// ---- admin ------------------------------------------------------------

export class AdminPromotionIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class AdminPromotionsQueryDto {
  @ApiPropertyOptional({
    enum: PROMOTION_STATUSES,
    enumName: 'CasePromotionStatus',
  })
  @IsOptional()
  @IsIn(PROMOTION_STATUSES)
  status?: PromotionStatus;

  @ApiPropertyOptional({ enum: PROMOTION_TARGETS, enumName: 'PromotionTarget' })
  @IsOptional()
  @IsIn(PROMOTION_TARGETS)
  target?: PromotionTarget;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  caseId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  postId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

export class AdminPromotionRowDto extends CasePromotionDto {
  @ApiProperty({ description: 'Case title, or the post title / text.' })
  caseTitle!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @ApiProperty({ type: 'integer' })
  refundedCents!: number;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  cpmCents!: number | null;

  @ApiProperty()
  caseStatus!: string;

  @ApiProperty({ format: 'uuid' })
  ownerId!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  ownerName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  ownerEmail!: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  paymentId!: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  promoCodeId!: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  grantedBy!: string | null;
}

export class AdminPromotionActionResultDto {
  @ApiProperty({ type: AdminPromotionRowDto })
  promotion!: AdminPromotionRowDto;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'E.g. "refund from the Payments screen" for a paid one.',
  })
  note!: string | null;
}

export class PromotionStatusCountDto {
  @ApiProperty()
  status!: string;

  @ApiProperty({ type: 'integer' })
  count!: number;
}

export class AdminPromotionStatsDto {
  @ApiProperty({ type: 'integer' })
  activeCount!: number;

  @ApiProperty({ type: 'integer' })
  revenue30dCents!: number;

  @ApiProperty({ type: 'integer' })
  paid30dCount!: number;

  @ApiProperty({ type: [PromotionStatusCountDto] })
  byStatus!: PromotionStatusCountDto[];

  // ---- owner 2026-10-05 ----
  @ApiProperty({ type: 'integer' })
  activePosts!: number;

  @ApiProperty({ type: 'integer' })
  activeCases!: number;

  @ApiProperty({ type: 'integer', description: 'Waiting for a staff check.' })
  pendingReview!: number;

  @ApiProperty({ type: 'integer', description: 'Impressions, last 30 days.' })
  impressions30d!: number;

  @ApiProperty({ type: 'integer' })
  reach30d!: number;

  @ApiProperty({ type: 'integer' })
  clicks30d!: number;
}

export class AdminGrantPromotionDto {
  @ApiPropertyOptional({
    enum: PROMOTION_TARGETS,
    enumName: 'PromotionTarget',
    default: 'case',
  })
  @IsOptional()
  @IsIn(PROMOTION_TARGETS)
  target?: PromotionTarget;

  @ApiProperty({ format: 'uuid', description: 'Case id or post id.' })
  @IsUUID('all')
  caseId!: string;

  @ApiPropertyOptional({
    type: 'integer',
    description: 'Daily budget it is worth (reach); default from settings.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  dailyBudgetCents?: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 365 })
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;

  @ApiPropertyOptional({ type: String, maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason = '';
}

export class AdminExtendPromotionDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 365 })
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;

  @ApiPropertyOptional({ type: String, maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason = '';
}

export const PROMOTION_REFUND_MODES = ['none', 'unspent', 'full'] as const;
export type PromotionRefundMode = (typeof PROMOTION_REFUND_MODES)[number];

export class AdminCancelPromotionDto {
  @ApiPropertyOptional({ type: String, maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason = '';

  @ApiPropertyOptional({
    enum: PROMOTION_REFUND_MODES,
    enumName: 'PromotionRefundMode',
    default: 'none',
    description: 'Owner 2026-10-05: give money back right away.',
  })
  @IsOptional()
  @IsIn(PROMOTION_REFUND_MODES)
  refund?: PromotionRefundMode;
}

export class AdminReviewPromotionDto {
  @ApiProperty({ enum: ['approve', 'reject'] })
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @ApiPropertyOptional({ type: String, maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason = '';
}

export class PromotionSettingsDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ type: 'integer', minimum: 50, maximum: 1_000_000 })
  @IsInt()
  @Min(50)
  @Max(1_000_000)
  priceCentsPerDay!: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 365 })
  @IsInt()
  @Min(1)
  @Max(365)
  maxDays!: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 1, default: 1 })
  @IsInt()
  @Min(1)
  @Max(1)
  maxActivePerCase!: number;

  // ---- owner 2026-10-05: Instagram-style boost ----
  @ApiProperty()
  @IsBoolean()
  postsEnabled!: boolean;

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    description: 'Price of 1 000 impressions.',
  })
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  cpmCents!: number;

  @ApiProperty({ type: 'integer', minimum: 50 })
  @IsInt()
  @Min(50)
  @Max(1_000_000)
  minDailyBudgetCents!: number;

  @ApiProperty({ type: 'integer', minimum: 50 })
  @IsInt()
  @Min(50)
  @Max(10_000_000)
  maxDailyBudgetCents!: number;

  @ApiProperty({ type: 'integer', isArray: true })
  @IsArray()
  @ArrayMaxSize(8)
  @IsInt({ each: true })
  budgetPresetsCents!: number[];

  @ApiProperty({ type: 'integer', isArray: true })
  @IsArray()
  @ArrayMaxSize(8)
  @IsInt({ each: true })
  durationPresets!: number[];

  @ApiProperty({ type: 'integer', minimum: 2, maximum: 50 })
  @IsInt()
  @Min(2)
  @Max(50)
  feedEveryN!: number;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 10 })
  @IsInt()
  @Min(0)
  @Max(10)
  caseFeedSlots!: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 50 })
  @IsInt()
  @Min(1)
  @Max(50)
  frequencyCapPerDay!: number;

  @ApiProperty({ minimum: 1, maximum: 10 })
  @IsNumber()
  @Min(1)
  @Max(10)
  impressionsPerPerson!: number;

  @ApiProperty()
  @IsBoolean()
  autoApprove!: boolean;

  @ApiProperty()
  @IsBoolean()
  requireSubscription!: boolean;
}
