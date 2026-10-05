import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsNotEmpty,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  FEE_PAYERS,
  FEE_TYPES,
  type FeePayer,
  type FeeType,
  PAYMENT_KINDS,
  PAYMENT_STATUSES,
  PAYOUT_ACCOUNT_STATUSES,
  type PaymentKind,
  type PaymentStatus,
  type PayoutAccountStatus,
} from './case-payments.settings';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// ---- shared -------------------------------------------------------------

export class CasePaymentCaseParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class CasePaymentIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class CasePaymentsCursorQueryDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

/** The money split the client sees before paying. */
export class PaymentQuoteDto {
  @ApiProperty({ type: 'integer', description: "The attorney's fee paid." })
  amountCents!: number;
  @ApiProperty({ type: 'integer' }) platformFeeCents!: number;
  @ApiProperty({ type: 'integer' }) processingFeeCents!: number;
  @ApiProperty({ type: 'integer', description: 'Charged to the card.' })
  clientTotalCents!: number;
  @ApiProperty({ type: 'integer', description: 'Lands on the attorney.' })
  attorneyNetCents!: number;
  @ApiProperty({ enum: FEE_TYPES, enumName: 'PaymentFeeType' })
  feeType!: FeeType;
  @ApiProperty({ enum: FEE_PAYERS, enumName: 'PaymentFeePayer' })
  feePayer!: FeePayer;
}

/** What the app needs to show / hide in-app payments. */
export class PaymentSettingsPublicDto {
  @ApiProperty({
    description: 'Flag on and Stripe configured: payments can be made.',
  })
  enabled!: boolean;
  @ApiProperty({ enum: FEE_TYPES, enumName: 'PaymentFeeType' })
  feeType!: FeeType;
  @ApiProperty({ type: 'integer' }) feeFixedCents!: number;
  @ApiProperty({ enum: FEE_PAYERS, enumName: 'PaymentFeePayer' })
  feePayer!: FeePayer;
  @ApiProperty() passProcessingFeeToClient!: boolean;
  @ApiProperty({ type: 'integer' }) minAmountCents!: number;
  @ApiProperty({ type: 'integer' }) maxAmountCents!: number;
  @ApiProperty() allowCustomAmount!: boolean;
  @ApiProperty() allowPartial!: boolean;
  @ApiProperty({ type: 'integer' }) refundWindowDays!: number;
  @ApiProperty({ description: 'Legal disclaimer, English.' })
  disclaimerEn!: string;
  @ApiProperty({ description: 'Legal disclaimer, Russian.' })
  disclaimerRu!: string;
}

export class PaymentQuoteQueryDto {
  @ApiProperty({ type: 'integer', minimum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(50)
  @Max(100_000_000)
  amountCents!: number;
}

// ---- payout account (attorney) --------------------------------------------

export class PayoutAccountDto {
  @ApiProperty({
    enum: ['none', ...PAYOUT_ACCOUNT_STATUSES],
    enumName: 'PayoutAccountStatus',
    description: 'none = the attorney has not started.',
  })
  status!: 'none' | PayoutAccountStatus;
  @ApiProperty({ description: 'Clients can pay this attorney now.' })
  canReceive!: boolean;
  @ApiProperty() chargesEnabled!: boolean;
  @ApiProperty() payoutsEnabled!: boolean;
  @ApiProperty() detailsSubmitted!: boolean;
  @ApiProperty({ type: [String], description: 'Stripe requirement keys.' })
  requirementsDue!: string[];
  @ApiProperty({ type: String, nullable: true }) disabledReason!: string | null;
  @ApiProperty({
    description: 'The payments feature is on and Stripe is configured.',
  })
  available!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  updatedAt!: string | null;
}

export class PayoutAccountLinkDto {
  @ApiProperty({ description: 'Short-lived Stripe URL to open in a browser.' })
  url!: string;
}

// ---- case payments (client + attorney) -------------------------------------

export class CasePaymentPartyDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @ApiProperty({ type: String, nullable: true }) username!: string | null;
  @ApiProperty({ type: String, nullable: true }) avatarUrl!: string | null;
}

export class CasePaymentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) caseId!: string;
  @ApiProperty({ type: String, nullable: true }) caseTitle!: string | null;
  @ApiProperty({ enum: PAYMENT_KINDS, enumName: 'CasePaymentKind' })
  kind!: PaymentKind;
  @ApiProperty({ enum: PAYMENT_STATUSES, enumName: 'CasePaymentStatus' })
  status!: PaymentStatus;
  @ApiProperty({ type: 'integer' }) amountCents!: number;
  @ApiProperty({ type: 'integer' }) platformFeeCents!: number;
  @ApiProperty({ type: 'integer' }) processingFeeCents!: number;
  @ApiProperty({ type: 'integer' }) clientTotalCents!: number;
  @ApiProperty({ type: 'integer' }) attorneyNetCents!: number;
  @ApiProperty({ type: 'integer' }) refundedCents!: number;
  @ApiProperty() currency!: string;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Stripe receipt.' })
  receiptUrl!: string | null;
  @ApiProperty({ type: String, nullable: true }) disputeStatus!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  paidAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: CasePaymentPartyDto, nullable: true })
  client!: CasePaymentPartyDto | null;
  @ApiProperty({ type: CasePaymentPartyDto, nullable: true })
  attorney!: CasePaymentPartyDto | null;
  @ApiProperty({
    description: 'The attorney (or admin) may still refund part of it.',
  })
  refundable!: boolean;
}

/** `GET /cases/:id/payments` — what either side of a case sees. */
export class CasePaymentsStateDto {
  @ApiProperty({ description: 'Feature on, Stripe configured.' })
  enabled!: boolean;
  @ApiProperty({
    description:
      "The attorney's payout account can receive (else the client sees a hint).",
  })
  attorneyReady!: boolean;
  @ApiProperty({
    description: 'The current user may start a payment on this case right now.',
  })
  canPay!: boolean;
  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'The accepted bid amount (null for hourly / free).',
  })
  bidAmountCents!: number | null;
  @ApiProperty({ type: 'integer' }) paidCents!: number;
  @ApiProperty({ type: 'integer' }) refundedCents!: number;
  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Bid minus what was paid (null when no fixed bid).',
  })
  remainingCents!: number | null;
  @ApiProperty({ type: 'integer' }) minAmountCents!: number;
  @ApiProperty({ type: 'integer' }) maxAmountCents!: number;
  @ApiProperty() allowCustomAmount!: boolean;
  @ApiProperty() allowPartial!: boolean;
  @ApiProperty({ type: [CasePaymentDto] }) items!: CasePaymentDto[];
}

export class CreateCasePaymentDto {
  @ApiProperty({
    enum: PAYMENT_KINDS,
    enumName: 'CasePaymentKind',
    description:
      'bid = the whole accepted bid; balance = what is left of it; deposit / custom = amountCents.',
  })
  @IsIn(PAYMENT_KINDS)
  kind!: PaymentKind;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 50,
    description: 'Required for deposit and custom.',
  })
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(100_000_000)
  amountCents?: number;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class CreateCasePaymentResultDto {
  @ApiProperty({ format: 'uuid' }) paymentId!: string;
  @ApiProperty({ description: 'Stripe Checkout page to open in a browser.' })
  checkoutUrl!: string;
  @ApiProperty({ type: PaymentQuoteDto }) quote!: PaymentQuoteDto;
  @ApiProperty({ type: CasePaymentDto }) payment!: CasePaymentDto;
}

export class RefundCasePaymentDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 50,
    description: 'Part of the attorney fee to give back; default = all left.',
  })
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(100_000_000)
  amountCents?: number;

  @ApiProperty({ minLength: 3, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class CasePaymentRefundDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) paymentId!: string;
  @ApiProperty({ type: 'integer' }) amountCents!: number;
  @ApiProperty() reason!: string;
  @ApiProperty({ enum: ['attorney', 'admin', 'stripe'] })
  initiatedByType!: string;
  @ApiProperty({ enum: ['pending', 'succeeded', 'failed'] }) status!: string;
  @ApiProperty({ type: String, nullable: true }) failureReason!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class MyCasePaymentsQueryDto extends CasePaymentsCursorQueryDto {
  @ApiPropertyOptional({
    enum: PAYMENT_STATUSES,
    enumName: 'CasePaymentStatus',
  })
  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  status?: PaymentStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  caseId?: string;
}

export class MyCasePaymentsSummaryDto {
  @ApiProperty({ type: 'integer', description: 'Succeeded, this year.' })
  totalCents!: number;
  @ApiProperty({ type: 'integer' }) count!: number;
  @ApiProperty({ type: 'integer' }) refundedCents!: number;
}

// ---- admin ----------------------------------------------------------------

export class AdminPaymentSettingsDto {
  @ApiProperty({ enum: FEE_TYPES, enumName: 'PaymentFeeType' })
  @IsIn(FEE_TYPES)
  feeType!: FeeType;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 100_000 })
  @IsInt()
  @Min(0)
  @Max(100_000)
  feeFixedCents!: number;

  @ApiProperty({ enum: FEE_PAYERS, enumName: 'PaymentFeePayer' })
  @IsIn(FEE_PAYERS)
  feePayer!: FeePayer;

  @ApiProperty()
  @IsBoolean()
  passProcessingFeeToClient!: boolean;

  @ApiProperty({ minimum: 0, maximum: 15 })
  @IsNumber()
  @Min(0)
  @Max(15)
  processingFeePercent!: number;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 500 })
  @IsInt()
  @Min(0)
  @Max(500)
  processingFeeFixedCents!: number;

  @ApiProperty({ type: 'integer', minimum: 50 })
  @IsInt()
  @Min(50)
  @Max(10_000_000)
  minAmountCents!: number;

  @ApiProperty({ type: 'integer', minimum: 50 })
  @IsInt()
  @Min(50)
  @Max(100_000_000)
  maxAmountCents!: number;

  @ApiProperty()
  @IsBoolean()
  allowCustomAmount!: boolean;

  @ApiProperty()
  @IsBoolean()
  allowPartial!: boolean;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 365 })
  @IsInt()
  @Min(0)
  @Max(365)
  refundWindowDays!: number;

  @ApiProperty({ maxLength: 4000, description: 'Legal disclaimer, English.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  disclaimerEn!: string;

  @ApiProperty({ maxLength: 4000, description: 'Legal disclaimer, Russian.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  disclaimerRu!: string;
}

export class AdminPaymentSettingsViewDto extends AdminPaymentSettingsDto {
  @ApiProperty({ description: 'The payments_in_app flag.' })
  flagEnabled!: boolean;
  @ApiProperty({ description: 'Stripe keys are configured.' })
  stripeConfigured!: boolean;
}

export class AdminCasePaymentsQueryDto extends CasePaymentsCursorQueryDto {
  @ApiPropertyOptional({
    enum: PAYMENT_STATUSES,
    enumName: 'CasePaymentStatus',
  })
  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  status?: PaymentStatus;

  @ApiPropertyOptional({ format: 'uuid', description: 'Client or attorney.' })
  @IsOptional()
  @IsUUID('all')
  userId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  caseId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Only disputed payments.' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  disputed?: boolean;
}

export class AdminCasePaymentRowDto extends CasePaymentDto {
  @ApiProperty({ type: String, nullable: true }) stripePaymentIntentId!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) stripeAccountId!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) failureCode!: string | null;
  @ApiProperty({ type: [CasePaymentRefundDto] })
  refunds!: CasePaymentRefundDto[];
}

export class AdminCasePaymentStatsDto {
  @ApiProperty({ type: 'integer', description: 'Succeeded, last 30 days.' })
  volume30dCents!: number;
  @ApiProperty({ type: 'integer' }) count30d!: number;
  @ApiProperty({ type: 'integer', description: 'Platform fees, 30 days.' })
  platformFees30dCents!: number;
  @ApiProperty({ type: 'integer' }) refunded30dCents!: number;
  @ApiProperty({ type: 'integer' }) disputedOpen!: number;
  @ApiProperty({ type: 'integer' }) pendingPayments!: number;
  @ApiProperty({ type: 'integer' }) payoutAccountsActive!: number;
  @ApiProperty({ type: 'integer' }) payoutAccountsPending!: number;
  @ApiProperty({ type: 'integer', description: 'All-time succeeded.' })
  volumeAllCents!: number;
  @ApiProperty({ type: 'integer' }) platformFeesAllCents!: number;
}

export class AdminPayoutAccountsQueryDto extends CasePaymentsCursorQueryDto {
  @ApiPropertyOptional({
    enum: PAYOUT_ACCOUNT_STATUSES,
    enumName: 'PayoutAccountStatus',
  })
  @IsOptional()
  @IsIn(PAYOUT_ACCOUNT_STATUSES)
  status?: PayoutAccountStatus;
}

export class AdminPayoutAccountRowDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ type: CasePaymentPartyDto, nullable: true })
  user!: CasePaymentPartyDto | null;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty() stripeAccountId!: string;
  @ApiProperty({
    enum: PAYOUT_ACCOUNT_STATUSES,
    enumName: 'PayoutAccountStatus',
  })
  status!: PayoutAccountStatus;
  @ApiProperty() chargesEnabled!: boolean;
  @ApiProperty() payoutsEnabled!: boolean;
  @ApiProperty({ type: [String] }) requirementsDue!: string[];
  @ApiProperty({ type: String, nullable: true }) disabledReason!: string | null;
  @ApiProperty({
    type: 'integer',
    description: 'Succeeded payments, all time.',
  })
  receivedCents!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastSyncedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AdminRefundCasePaymentDto extends RefundCasePaymentDto {}

export class AdminPayoutAccountActionResultDto {
  @ApiProperty({ type: AdminPayoutAccountRowDto })
  account!: AdminPayoutAccountRowDto;
}

export class AdminPayoutAccountUserParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  userId!: string;
}
