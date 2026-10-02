import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  PROMO_APPLIES_TO,
  PROMO_AUDIENCES,
  PROMO_DISCOUNT_TYPES,
  type PromoAppliesTo,
  type PromoAudience,
  type PromoDiscountType,
} from './promo-rules';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const bool = ({ value }: { value: unknown }) =>
  value === 'true' || value === true
    ? true
    : value === 'false' || value === false
      ? false
      : value;

// ---- shared ---------------------------------------------------------------

export class AdminBillingIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class AdminBillingUserParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  userId!: string;
}

export class AdminBillingCursorQueryDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

/** Who a billing row belongs to (one users query per page). */
export class AdminBillingUserDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @ApiProperty({ type: String, nullable: true }) username!: string | null;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) role!: string | null;
}

/** A reason for a money / access action (audited). */
export class AdminBillingReasonDto {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(10, 500)
  reason!: string;
}

// ---- contract grants ---------------------------------------------------------

export const GRANT_STATUSES = [
  'scheduled',
  'active',
  'expired',
  'revoked',
] as const;
export type GrantStatus = (typeof GRANT_STATUSES)[number];

export class AdminGrantsQueryDto extends AdminBillingCursorQueryDto {
  @ApiPropertyOptional({
    enum: GRANT_STATUSES,
    enumName: 'ContractGrantStatus',
  })
  @IsOptional()
  @IsIn(GRANT_STATUSES)
  status?: GrantStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  userId?: string;
}

export class CreateContractGrantDto {
  @ApiProperty({ format: 'uuid', description: 'A live attorney.' })
  @IsUUID('all')
  userId!: string;

  @ApiProperty({ type: 'integer', minimum: 3, maximum: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(12)
  months!: number;

  @ApiPropertyOptional({ type: 'integer', minimum: 0, maximum: 6, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  assistantSeats?: number;

  @ApiPropertyOptional({ format: 'date-time', description: 'Default: now.' })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({ maxLength: 200, description: 'Contract / handle.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  contractRef?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ExtendContractGrantDto {
  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: 12,
    description: 'Added to the end date; a grant spans at most 24 months.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  months!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ContractGrantDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ type: AdminBillingUserDto, nullable: true })
  user!: AdminBillingUserDto | null;
  @ApiProperty({ type: 'integer' }) months!: number;
  @ApiProperty({ type: 'integer' }) assistantSeats!: number;
  @ApiProperty({ format: 'date-time' }) startsAt!: string;
  @ApiProperty({ format: 'date-time' }) endsAt!: string;
  @ApiProperty({ enum: GRANT_STATUSES, enumName: 'ContractGrantStatus' })
  status!: GrantStatus;
  @ApiProperty({ type: String, nullable: true }) contractRef!: string | null;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ format: 'uuid' }) createdBy!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  revokedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) revokedBy!: string | null;
  @ApiProperty({ type: String, nullable: true }) revokeReason!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

// ---- promo codes -------------------------------------------------------------

export const PROMO_STATUSES = [
  'active',
  'scheduled',
  'expired',
  'exhausted',
  'inactive',
] as const;
export type PromoStatus = (typeof PROMO_STATUSES)[number];

export class AdminPromoQueryDto extends AdminBillingCursorQueryDto {
  @ApiPropertyOptional({
    enum: ['active', 'expired', 'inactive'],
    enumName: 'PromoCodeFilter',
  })
  @IsOptional()
  @IsIn(['active', 'expired', 'inactive'])
  status?: 'active' | 'expired' | 'inactive';

  @ApiPropertyOptional({ description: 'Code prefix.', maxLength: 40 })
  @IsOptional()
  @Transform(upper)
  @IsString()
  @MaxLength(40)
  q?: string;
}

export class CreatePromoCodeDto {
  @ApiProperty({
    description: 'A–Z, 0–9, "-", "_"; 3–40 chars; stored upper-case.',
    example: 'BLOGGER20',
  })
  @Transform(upper)
  @IsString()
  @Matches(/^[A-Z0-9_-]{3,40}$/)
  code!: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty({ enum: PROMO_DISCOUNT_TYPES, enumName: 'PromoDiscountType' })
  @IsIn(PROMO_DISCOUNT_TYPES)
  discountType!: PromoDiscountType;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 100,
    description: 'Required for percent.',
  })
  @ValidateIf((o: CreatePromoCodeDto) => o.discountType === 'percent')
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  percentOff?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    description: 'Required for amount (cents, USD).',
  })
  @ValidateIf((o: CreatePromoCodeDto) => o.discountType === 'amount')
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  amountOffCents?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 365,
    description: 'Required for free_days (added to the trial).',
  })
  @ValidateIf((o: CreatePromoCodeDto) => o.discountType === 'free_days')
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  freeDays?: number;

  @ApiPropertyOptional({
    enum: PROMO_AUDIENCES,
    enumName: 'PromoAudience',
    default: 'attorney',
  })
  @IsOptional()
  @IsIn(PROMO_AUDIENCES)
  audience?: PromoAudience;

  @ApiPropertyOptional({
    enum: PROMO_APPLIES_TO,
    enumName: 'PromoAppliesTo',
    default: 'any',
  })
  @IsOptional()
  @IsIn(PROMO_APPLIES_TO)
  appliesTo?: PromoAppliesTo;

  @ApiPropertyOptional({ type: 'integer', minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  maxRedemptions?: number;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdatePromoCodeDto {
  @ApiPropertyOptional({ type: String, maxLength: 300, nullable: true })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    nullable: true,
    description: 'null = unlimited.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  maxRedemptions?: number | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'null = never expires.',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}

export class PromoCodeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ enum: PROMO_DISCOUNT_TYPES, enumName: 'PromoDiscountType' })
  discountType!: PromoDiscountType;
  @ApiProperty({ type: 'integer', nullable: true }) percentOff!: number | null;
  @ApiProperty({ type: 'integer', nullable: true }) amountOffCents!:
    number | null;
  @ApiProperty({ type: 'integer', nullable: true }) freeDays!: number | null;
  @ApiProperty({ enum: PROMO_AUDIENCES, enumName: 'PromoAudience' })
  audience!: PromoAudience;
  @ApiProperty({ enum: PROMO_APPLIES_TO, enumName: 'PromoAppliesTo' })
  appliesTo!: PromoAppliesTo;
  @ApiProperty({ type: 'integer', nullable: true }) maxRedemptions!:
    number | null;
  @ApiProperty({ type: 'integer' }) redeemedCount!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startsAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiresAt!: string | null;
  @ApiProperty() active!: boolean;
  @ApiProperty({ enum: PROMO_STATUSES, enumName: 'PromoCodeStatus' })
  status!: PromoStatus;
  @ApiProperty({ type: String, nullable: true }) stripeCouponId!: string | null;
  @ApiProperty({ format: 'uuid' }) createdBy!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class PromoRedemptionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) promoId!: string;
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ type: AdminBillingUserDto, nullable: true })
  user!: AdminBillingUserDto | null;
  @ApiProperty({ type: 'integer', nullable: true }) amountOffCents!:
    number | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  paymentId!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

/** POST /billing/promo/validate (the app). */
export class ValidatePromoDto {
  @ApiProperty({ example: 'BLOGGER20', maxLength: 40 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  code!: string;

  @ApiProperty({
    enum: ['monthly', 'yearly', 'promotion'],
    enumName: 'PromoPurchase',
    description: 'What the code is for.',
  })
  @IsIn(['monthly', 'yearly', 'promotion'])
  appliesTo!: 'monthly' | 'yearly' | 'promotion';
}

export const PROMO_REJECT_REASONS = [
  'not_found',
  'inactive',
  'not_started',
  'expired',
  'exhausted',
  'wrong_audience',
  'wrong_plan',
  'already_used',
] as const;

export class PromoValidationDto {
  @ApiProperty() valid!: boolean;
  @ApiProperty({ description: 'Normalized (upper-case).' }) code!: string;
  @ApiProperty({
    enum: PROMO_DISCOUNT_TYPES,
    enumName: 'PromoDiscountType',
    nullable: true,
  })
  discountType!: PromoDiscountType | null;
  @ApiProperty({ type: 'integer', nullable: true }) percentOff!: number | null;
  @ApiProperty({ type: 'integer', nullable: true }) amountOffCents!:
    number | null;
  @ApiProperty({ type: 'integer', nullable: true }) freeDays!: number | null;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({
    enum: PROMO_REJECT_REASONS,
    enumName: 'PromoRejectReason',
    nullable: true,
    description: 'Why the code cannot be used (valid = false).',
  })
  reason!: (typeof PROMO_REJECT_REASONS)[number] | null;
}

// ---- payments & refunds ------------------------------------------------------

export const PAYMENT_STATUSES = [
  'pending',
  'succeeded',
  'failed',
  'refunded',
] as const;

export class AdminPaymentsQueryDto extends AdminBillingCursorQueryDto {
  @ApiPropertyOptional({ enum: PAYMENT_STATUSES, enumName: 'PaymentStatus' })
  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  status?: (typeof PAYMENT_STATUSES)[number];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  userId?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'created_at ≥' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'created_at <' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class AdminPaymentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ type: AdminBillingUserDto, nullable: true })
  user!: AdminBillingUserDto | null;
  @ApiProperty({ type: 'integer' }) amountCents!: number;
  @ApiProperty() currency!: string;
  @ApiProperty({ enum: PAYMENT_STATUSES, enumName: 'PaymentStatus' })
  status!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  paidAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) failureCode!: string | null;
  @ApiProperty({ type: String, nullable: true }) stripeInvoiceId!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) stripePaymentIntentId!:
    string | null;
  @ApiProperty({
    type: 'integer',
    description: 'Refunds issued from the admin (pending + succeeded).',
  })
  refundedCents!: number;
  @ApiProperty({ type: 'integer' }) refundableCents!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class CreateRefundDto extends AdminBillingReasonDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  paymentId!: string;

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    description: 'At most the paid amount minus earlier refunds.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amountCents!: number;
}

export class AdminRefundsQueryDto extends AdminBillingCursorQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  paymentId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  userId?: string;
}

export class RefundDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) paymentId!: string;
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ type: AdminBillingUserDto, nullable: true })
  user!: AdminBillingUserDto | null;
  @ApiProperty({ type: 'integer' }) amountCents!: number;
  @ApiProperty() reason!: string;
  @ApiProperty({ enum: ['pending', 'succeeded', 'failed'] }) status!: string;
  @ApiProperty({ type: String, nullable: true }) stripeRefundId!: string | null;
  @ApiProperty({ type: String, nullable: true }) failureReason!: string | null;
  @ApiProperty({ format: 'uuid' }) adminId!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

// ---- subscriptions list ------------------------------------------------------

export class AdminBillingSubscriptionsQueryDto extends AdminBillingCursorQueryDto {
  @ApiPropertyOptional({
    enum: [
      'incomplete',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'expired',
    ],
  })
  @IsOptional()
  @IsIn(['incomplete', 'trialing', 'active', 'past_due', 'canceled', 'expired'])
  status?:
    'incomplete' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';

  @ApiPropertyOptional({ enum: ['monthly', 'yearly'] })
  @IsOptional()
  @IsIn(['monthly', 'yearly'])
  plan?: 'monthly' | 'yearly';

  @ApiPropertyOptional({ description: 'Name or email.', maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'Only with / without an active grant.' })
  @IsOptional()
  @Transform(bool)
  @IsBoolean()
  hasContractGrant?: boolean;
}

export class ActiveGrantSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'date-time' }) endsAt!: string;
  @ApiProperty({ type: 'integer' }) assistantSeats!: number;
}

export class AdminBillingSubscriptionRowDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ type: AdminBillingUserDto, nullable: true })
  user!: AdminBillingUserDto | null;
  @ApiProperty() status!: string;
  @ApiProperty({ enum: ['monthly', 'yearly'] }) plan!: string;
  @ApiProperty({ type: 'integer', description: 'Paid seats.' })
  assistantSeats!: number;
  @ApiProperty({
    type: 'integer',
    description: 'max(paid seats, active grant seats).',
  })
  effectiveSeats!: number;
  @ApiProperty({ type: 'integer' }) priceCents!: number;
  @ApiProperty({
    type: 'integer',
    description: 'Monthly value of the plan (yearly / 12).',
  })
  monthlyEquivalentCents!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  trialEndsAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  currentPeriodEnd!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  graceEndsAt!: string | null;
  @ApiProperty() cancelAtPeriodEnd!: boolean;
  @ApiProperty({ type: String, nullable: true }) stripeSubscriptionId!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) stripeCustomerId!:
    string | null;
  @ApiProperty({ description: 'Stripe row active, or an active grant.' })
  isActive!: boolean;
  @ApiProperty({ type: ActiveGrantSummaryDto, nullable: true })
  contractGrant!: ActiveGrantSummaryDto | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

// ---- overview ----------------------------------------------------------------

export class BillingSubscriptionCountsDto {
  @ApiProperty({ type: 'integer' }) active!: number;
  @ApiProperty({ type: 'integer' }) trialing!: number;
  @ApiProperty({ type: 'integer' }) pastDue!: number;
  @ApiProperty({ type: 'integer' }) monthly!: number;
  @ApiProperty({ type: 'integer' }) yearly!: number;
}

export class BillingOverviewDto {
  @ApiProperty({
    type: 'integer',
    description:
      'Active + past_due: monthly $399 + $100 × seats, yearly $9,590 / 12. Trials and contract grants count $0.',
  })
  mrrCents!: number;
  @ApiProperty({ type: BillingSubscriptionCountsDto })
  subscriptions!: BillingSubscriptionCountsDto;
  @ApiProperty({ type: 'integer' }) contractGrantsActive!: number;
  @ApiProperty({
    type: 'integer',
    description: 'Paid in the last 30 days minus refunds issued then.',
  })
  revenue30dCents!: number;
  @ApiProperty({ type: 'integer' }) grossRevenue30dCents!: number;
  @ApiProperty({ type: 'integer' }) refunds30dCents!: number;
  @ApiProperty({ type: 'integer' }) refunds30dCount!: number;
  @ApiProperty({ type: 'integer' }) promoRedemptions30d!: number;
  @ApiProperty({ format: 'date-time' }) generatedAt!: string;
}
