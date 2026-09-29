import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

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

export class SubscriptionMeDto {
  @ApiProperty({ type: SubscriptionDto, nullable: true })
  subscription!: SubscriptionDto | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({
    description: 'Verified attorney without a live subscription may start.',
  })
  canStart!: boolean;
  @ApiProperty() trialEligible!: boolean;
  @ApiProperty({ type: 'integer' }) priceCents!: number;
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

  @ApiProperty({
    maxLength: 500,
    description: 'Required (§1.6): e.g. the confirmed contact issue.',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
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
