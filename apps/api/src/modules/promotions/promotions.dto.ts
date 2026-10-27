import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
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
  BILLING_MODELS,
  CLIENT_REPORTED_ACTIONS,
  PROMOTION_CTA_TYPES,
  PROMOTION_GOALS,
  PROMOTION_STATUSES,
  PROMOTION_TARGETS,
  type BillingModel,
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

  @ApiPropertyOptional({
    description: 'Owner 2026-10-27: the post has a video (video prices).',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  video?: boolean;

  @ApiPropertyOptional({
    enum: BILLING_MODELS,
    enumName: 'BoostBilling',
    description: 'Owner 2026-10-27: what to pay for; default = the first on.',
  })
  @IsOptional()
  @IsIn(BILLING_MODELS)
  billing?: BillingModel;
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
  @ApiPropertyOptional({
    enum: ['card', 'stars'],
    description:
      'How to pay: the web card checkout (default) or the star balance.',
  })
  @IsOptional()
  @IsIn(['card', 'stars'])
  payWith?: 'card' | 'stars';

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

  @ApiPropertyOptional({
    description:
      'Owner 2026-10-15: extend a running boost — the new days start when it ends.',
  })
  @IsOptional()
  @IsBoolean()
  extend?: boolean;

  @ApiPropertyOptional({ enum: PROMOTION_GOALS })
  @IsOptional()
  @IsIn(PROMOTION_GOALS)
  goal?: string;

  @ApiPropertyOptional({
    enum: PROMOTION_CTA_TYPES,
    description: 'The button under a promoted post (posts only).',
  })
  @IsOptional()
  @IsIn(PROMOTION_CTA_TYPES)
  ctaType?: string;

  @ApiPropertyOptional({
    maxLength: 500,
    description: 'https link (more, download) or a phone (call).',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  ctaValue?: string;

  @ApiPropertyOptional({
    enum: BILLING_MODELS,
    enumName: 'BoostBilling',
    description:
      'Owner 2026-10-27: what to pay for (views, people, taps, real actions); default = the first one the owner switched on.',
  })
  @IsOptional()
  @IsIn(BILLING_MODELS)
  billing?: BillingModel;
}

/** Owner 2026-10-27: one way to pay the buyer may pick. */
export class BoostOfferDto {
  @ApiProperty({ enum: BILLING_MODELS, enumName: 'BoostBilling' })
  billing!: BillingModel;

  @ApiProperty({
    type: 'integer',
    description: 'Per 1000 for impressions / reach, per one otherwise.',
  })
  priceCents!: number;
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

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'The same total in stars; null while stars are switched off or nothing is due.',
  })
  starsTotal!: number | null;

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

  /** Owner 2026-10-15: the buttons an advertiser may pick (empty = none). */
  @ApiProperty({ type: String, isArray: true })
  ctaTypes!: string[];

  // ---- owner 2026-10-27: what the boost is paid for ----
  @ApiProperty({ enum: BILLING_MODELS, enumName: 'BoostBilling' })
  billing!: BillingModel;

  @ApiProperty({
    type: 'integer',
    description: 'Per 1000 for impressions / reach, per one otherwise.',
  })
  unitPriceCents!: number;

  @ApiProperty({
    type: 'integer',
    description: 'Units this budget buys in the chosen way to pay.',
  })
  estUnits!: number;

  @ApiProperty({
    type: [BoostOfferDto],
    description: 'The ways to pay that are switched on.',
  })
  offers!: BoostOfferDto[];

  @ApiProperty({
    type: [String],
    description: 'What counts as a real action (when paid per action).',
  })
  actions!: string[];
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

  @ApiProperty({ type: 'integer', description: 'Stars paid (0 = by card).' })
  paidStars!: number;

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

  // ---- owner 2026-10-27: what it is paid for ----
  @ApiProperty({ enum: BILLING_MODELS, enumName: 'BoostBilling' })
  billing!: BillingModel;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  unitPriceCents!: number | null;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    description: 'Units the budget buys (views, people, taps, actions).',
  })
  targetUnits!: number | null;

  @ApiProperty({ type: 'integer', description: 'Units delivered so far.' })
  deliveredUnits!: number;

  @ApiProperty({ type: 'integer', description: 'Real actions counted.' })
  actions!: number;

  @ApiProperty({ type: 'integer', description: 'Money given back.' })
  refundedCents!: number;

  @ApiPropertyOptional({ type: PromotionAudienceDto, nullable: true })
  audience!: PromotionAudienceDto | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  cancelReason!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  goal!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  ctaType!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  ctaValue!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

/** The numbers of one day of a promotion (UTC date). */
export class PromotionDayDto {
  @ApiProperty({ example: '2026-10-15' })
  day!: string;
  @ApiProperty({ type: 'integer' })
  impressions!: number;
  @ApiProperty({ type: 'integer' })
  reach!: number;
  @ApiProperty({ type: 'integer' })
  clicks!: number;
}

/** A row of "My promotions" (owner 2026-10-05). */
export class MyPromotionDto extends CasePromotionDto {
  @ApiProperty({ description: 'Case title / post title or text start.' })
  title!: string;
}

/** One promotion with its numbers by day (owner 2026-10-15). */
export class PromotionStatsDto {
  @ApiProperty({ type: () => MyPromotionDto })
  promotion!: MyPromotionDto;
  @ApiProperty({ type: [PromotionDayDto] })
  days!: PromotionDayDto[];
  @ApiProperty({ type: 'integer', description: 'Spent so far, cents.' })
  spentCents!: number;
}

export class MyPromotionsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

/** Owner 2026-10-27: a real action only the app can see. */
export class PromotionActionDto {
  @ApiProperty({ enum: CLIENT_REPORTED_ACTIONS })
  @IsIn(CLIENT_REPORTED_ACTIONS)
  kind!: (typeof CLIENT_REPORTED_ACTIONS)[number];
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

  @ApiProperty({
    type: 'integer',
    description: 'Stars taken when paid with the star balance, else 0.',
  })
  starsCharged!: number;

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

/** Owner 2026-10-27: one billing model's last 30 days (nightly snapshot). */
export class PromotionModelStatDto {
  @ApiProperty({ enum: BILLING_MODELS, enumName: 'BoostBilling' })
  billing!: BillingModel;

  @ApiProperty({ type: 'integer' })
  count!: number;

  @ApiProperty({ type: 'integer', description: 'Sold for, cents.' })
  soldCents!: number;

  @ApiProperty({ type: 'integer', description: 'Given back, cents.' })
  refundedCents!: number;

  @ApiProperty({ type: 'integer', description: 'Units delivered.' })
  delivered!: number;
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

  @ApiProperty({
    type: [PromotionModelStatDto],
    description:
      'Owner 2026-10-27: the last 30 days by way to pay, from the nightly snapshot (empty until the first one).',
  })
  byModel!: PromotionModelStatDto[];

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  byModelAt!: string | null;
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

export class ModelPriceDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    description: 'Per 1000 for impressions / reach, per one otherwise.',
  })
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  priceCents!: number;
}

export class BillingModelsDto {
  @ApiProperty({ type: ModelPriceDto, description: 'Views (per 1000).' })
  @ValidateNested()
  @Type(() => ModelPriceDto)
  impressions!: ModelPriceDto;

  @ApiProperty({ type: ModelPriceDto, description: 'People (per 1000).' })
  @ValidateNested()
  @Type(() => ModelPriceDto)
  reach!: ModelPriceDto;

  @ApiProperty({ type: ModelPriceDto, description: 'Taps (each).' })
  @ValidateNested()
  @Type(() => ModelPriceDto)
  clicks!: ModelPriceDto;

  @ApiProperty({ type: ModelPriceDto, description: 'Real actions (each).' })
  @ValidateNested()
  @Type(() => ModelPriceDto)
  actions!: ModelPriceDto;
}

export class TargetPricingDto {
  @ApiProperty({ type: BillingModelsDto })
  @ValidateNested()
  @Type(() => BillingModelsDto)
  models!: BillingModelsDto;

  @ApiProperty({ type: [String], description: 'What counts as an action.' })
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  actions!: string[];
}

export class PricingMatrixDto {
  @ApiProperty({ type: TargetPricingDto })
  @ValidateNested()
  @Type(() => TargetPricingDto)
  post!: TargetPricingDto;

  @ApiProperty({ type: TargetPricingDto })
  @ValidateNested()
  @Type(() => TargetPricingDto)
  video!: TargetPricingDto;

  @ApiProperty({ type: TargetPricingDto })
  @ValidateNested()
  @Type(() => TargetPricingDto)
  case!: TargetPricingDto;

  @ApiProperty({ type: TargetPricingDto })
  @ValidateNested()
  @Type(() => TargetPricingDto)
  profile!: TargetPricingDto;
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

  @ApiProperty({ type: 'integer', minimum: 10, maximum: 15 })
  @IsInt()
  @Min(10)
  @Max(15)
  feedEveryN!: number;

  @ApiProperty({ type: 'integer', minimum: 10, maximum: 15 })
  @IsInt()
  @Min(10)
  @Max(15)
  reelEveryN!: number;

  @ApiProperty()
  @IsBoolean()
  reelsEnabled!: boolean;

  @ApiProperty()
  @IsBoolean()
  boostEnabled!: boolean;

  @ApiProperty()
  @IsBoolean()
  attorneysEnabled!: boolean;

  @ApiProperty()
  @IsBoolean()
  clientsEnabled!: boolean;

  @ApiProperty()
  @IsBoolean()
  ctaEnabled!: boolean;

  @ApiProperty({ type: String, isArray: true })
  @IsArray()
  @ArrayMaxSize(8)
  @IsIn(PROMOTION_CTA_TYPES, { each: true })
  ctaTypes!: string[];

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

  @ApiProperty({
    type: PricingMatrixDto,
    description:
      'Owner 2026-10-27: prices and switches per way to pay (views, people, taps, real actions) for posts, videos, cases and attorney profiles.',
  })
  @ValidateNested()
  @Type(() => PricingMatrixDto)
  pricing!: PricingMatrixDto;
}

/**
 * `PUT /admin/promotions/settings`. Every field is optional: what is not
 * sent keeps its stored value (an older admin build sends only the fields
 * it knows). `feedEveryN` keeps the range this endpoint always accepted
 * (2-50); the service narrows it to 10-15 and answers 400 outside it.
 */
export class UpdatePromotionSettingsDto extends PartialType(
  OmitType(PromotionSettingsDto, ['feedEveryN'] as const),
) {
  @ApiPropertyOptional({ type: 'integer', minimum: 2, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(50)
  feedEveryN?: number;
}
