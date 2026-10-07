import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PlanEntitlementsDto,
  PublicPlanDto,
  SeatSummaryDto,
} from '../plans/plans.dto';
import { PriceDiscountDto } from './price-discount.dto';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  IsArray,
  ArrayMaxSize,
  Matches,
} from 'class-validator';
import { SEATS_HARD_CAP } from './billing.constants';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Owner 2026-10-02: the promo code applied to a checkout. */
export class CheckoutPromoDto {
  @ApiProperty() code!: string;
  @ApiProperty({
    enum: ['percent', 'amount', 'free_days'],
    enumName: 'PromoDiscountType',
  })
  discountType!: 'percent' | 'amount' | 'free_days';
  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Off the first invoice (percent / amount codes).',
  })
  discountCents!: number | null;
  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Free days added to the trial (free_days codes).',
  })
  freeDays!: number | null;
}

/** Owner 2026-09-30: Stripe's hosted payment page for the subscription. */
export class CheckoutSessionDto {
  @ApiProperty({ description: 'Open in the browser.' })
  url!: string;
  @ApiProperty() sessionId!: string;
  @ApiProperty() trialEligible!: boolean;
  @ApiProperty({ type: 'integer' }) priceCents!: number;
  @ApiProperty({ type: 'integer' }) trialDays!: number;
  @ApiPropertyOptional({
    type: CheckoutPromoDto,
    description: 'Present when a promo code was applied (owner 2026-10-02).',
  })
  promo?: CheckoutPromoDto;
}

/** POST /subscriptions/checkout (OQ-048): the plan, seats and the phones
 * of assistants added at purchase (they join without the attorney's OTP). */
export class CheckoutRequestDto {
  @ApiPropertyOptional({
    enum: ['monthly', 'yearly'],
    enumName: 'SubscriptionPlan',
    default: 'monthly',
  })
  @IsOptional()
  @IsIn(['monthly', 'yearly'])
  plan?: 'monthly' | 'yearly';

  @ApiPropertyOptional({
    description:
      "Owner 2026-10-05: the plan to buy (code from GET /plans or /subscriptions/me). Default: the audience's default plan of `plan`'s interval.",
    maxLength: 64,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 64)
  @Matches(/^[a-z0-9_-]+$/)
  planCode?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 0,
    maximum: SEATS_HARD_CAP,
    default: 0,
    description: 'Extra assistant seats on top of the ones the plan includes.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(SEATS_HARD_CAP)
  assistantSeats?: number;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 6,
    example: ['+13125550111'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @Matches(/^\+[1-9][0-9]{7,14}$/, { each: true })
  assistantPhones?: string[];

  @ApiPropertyOptional({
    description:
      'Owner 2026-10-02: a promo code (case-insensitive). 400 PROMO_CODE_INVALID with details.reason when it cannot be used.',
    example: 'BLOGGER20',
    maxLength: 40,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(3, 40)
  promoCode?: string;
}

export class SetSeatsDto {
  @ApiProperty({
    type: 'integer',
    minimum: 0,
    maximum: SEATS_HARD_CAP,
    description: 'Extra seats on top of the ones the plan includes.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(SEATS_HARD_CAP)
  seats!: number;
}

export class CompleteCheckoutDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  sessionId!: string;
}

export class StartSubscriptionResultDto {
  @ApiProperty({
    description: 'SetupIntent client secret for the PaymentSheet.',
  })
  clientSecret!: string;
  @ApiProperty() setupIntentId!: string;
  @ApiProperty({ description: 'Stripe customer id (PaymentSheet customer).' })
  customerId!: string;
  @ApiProperty({
    description:
      'A 7-day trial is available for this attorney (card checked at confirm).',
  })
  trialEligible!: boolean;
  @ApiProperty({ type: 'integer' }) priceCents!: number;
  @ApiProperty({ type: 'integer' }) trialDays!: number;
}

export class ConfirmSubscriptionDto {
  @ApiProperty()
  @IsString()
  @Length(8, 200)
  setupIntentId!: string;

  @ApiPropertyOptional({
    description:
      'Required when the trial is unavailable (409 SUBSCRIPTION_TRIAL_UNAVAILABLE): the user confirmed "$399 will be charged now".',
  })
  @IsOptional()
  @IsBoolean()
  chargeNow?: boolean;
}

export class SubscriptionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({
    enum: [
      'incomplete',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'expired',
    ],
  })
  status!: string;
  @ApiProperty({
    description: 'docs/06 §1.2 verdict (trial / active / grace).',
  })
  isActive!: boolean;
  @ApiProperty({ type: 'integer' }) priceCents!: number;
  @ApiProperty({ enum: ['monthly', 'yearly'], enumName: 'SubscriptionPlan' })
  plan!: 'monthly' | 'yearly';
  @ApiProperty({
    type: 'integer',
    description:
      "Every assistant seat the attorney has: the plan's included seats + the extra bought (owner 2026-10-05).",
  })
  assistantSeats!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  trialEndsAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  currentPeriodEnd!: string | null;
  @ApiProperty() cancelAtPeriodEnd!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  canceledAt!: string | null;
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'past_due grace deadline.',
  })
  graceEndsAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

/** OQ-048: the prices the paywall shows. */
export class PlanPricesDto {
  @ApiProperty({ type: 'integer' }) monthlyCents!: number;
  @ApiProperty({ type: 'integer' }) seatCents!: number;
  @ApiProperty({ type: 'integer' }) yearlyCents!: number;
  @ApiProperty({ type: 'integer' }) maxSeats!: number;
  @ApiProperty({
    type: 'integer',
    description:
      'Free trial days for a new subscription (admin setting; 0 = no trial).',
  })
  trialDays!: number;
  @ApiProperty({ type: PriceDiscountDto, nullable: true })
  monthlyDiscount!: PriceDiscountDto | null;
  @ApiProperty({ type: PriceDiscountDto, nullable: true })
  seatDiscount!: PriceDiscountDto | null;
  @ApiProperty({ type: PriceDiscountDto, nullable: true })
  yearlyDiscount!: PriceDiscountDto | null;
}

/** Owner 2026-10-02: "Free under contract until …". */
export class ContractGrantInfoDto {
  @ApiProperty({ format: 'date-time' }) endsAt!: string;
  @ApiProperty({ type: 'integer' }) assistantSeats!: number;
}

export class SubscriptionMeDto {
  @ApiProperty({ type: SubscriptionDto, nullable: true })
  subscription!: SubscriptionDto | null;
  @ApiProperty({
    type: ContractGrantInfoDto,
    nullable: true,
    description:
      'An active free subscription under a contract (isActive is true while it runs).',
  })
  contractGrant!: ContractGrantInfoDto | null;
  @ApiProperty({ type: PlanPricesDto })
  prices!: PlanPricesDto;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({
    description: 'Verified attorney without a live subscription may start.',
  })
  canStart!: boolean;
  @ApiProperty() trialEligible!: boolean;
  @ApiProperty({ type: 'integer' }) priceCents!: number;
  // Owner 2026-10-05 (plan builder): the plan the attorney is on, every
  // plan for sale and the entitlements that stand right now.
  @ApiProperty({ type: PublicPlanDto, nullable: true })
  plan!: PublicPlanDto | null;
  @ApiProperty({ type: [PublicPlanDto] }) plans!: PublicPlanDto[];
  @ApiProperty({ type: PlanEntitlementsDto })
  entitlements!: PlanEntitlementsDto;
  @ApiProperty({ type: SeatSummaryDto, nullable: true })
  seats!: SeatSummaryDto | null;
}

export class PaymentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: 'integer' }) amountCents!: number;
  @ApiProperty() currency!: string;
  @ApiProperty({ enum: ['pending', 'succeeded', 'failed', 'refunded'] })
  status!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) paidAt!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) failureCode!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export interface PaymentsPage {
  items: PaymentDto[];
  nextCursor: string | null;
}

export class PaymentsQueryDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

export class PortalSessionDto {
  @ApiProperty({ format: 'uri' }) url!: string;
}

export class WebhookAckDto {
  @ApiProperty() received!: true;
  @ApiProperty({ description: 'False when the event id was already stored.' })
  queued!: boolean;
}

// ---- admin (§1.6) -------------------------------------------------------

export class AdminSubscriptionUserParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  userId!: string;
}

export class ExtendSubscriptionDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 90 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days!: number;

  @ApiPropertyOptional({
    type: String,
    maxLength: 500,
    description: 'Optional: e.g. the confirmed contact issue.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason = '';
}

export class AdminSubscriptionDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ type: SubscriptionDto, nullable: true })
  subscription!: SubscriptionDto | null;
  @ApiProperty({ type: String, nullable: true }) stripeSubscriptionId!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) stripeCustomerId!:
    string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Stripe Dashboard link.',
  })
  dashboardUrl!: string | null;
  @ApiProperty({ type: [PaymentDto], description: 'Last 50.' })
  payments!: PaymentDto[];
  @ApiProperty({ type: 'integer' }) trialsUsedWithCard!: number;
}
