import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
  ValidateNested,
} from 'class-validator';
import {
  FEE_PAYER_PARTIES,
  FEE_PAYER_STATUSES,
  FEE_PAYERS,
  FEE_TYPES,
  type FeePayerParty,
  type FeePayerStatus,
  type FeePayer,
  type FeeType,
  PAYMENT_KINDS,
  PAYMENT_REQUEST_STATUSES,
  PAYMENT_STATUSES,
  PAYOUT_ACCOUNT_STATUSES,
  PROCESSING_FEE_PAYERS,
  type PaymentKind,
  type PaymentRequestStatus,
  type PaymentStatus,
  type PayoutAccountStatus,
  type ProcessingFeePayer,
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
  @ApiProperty({
    type: 'integer',
    description: "Stripe's card fee on the whole charge (estimate).",
  })
  stripeFeeEstimateCents!: number;
  @ApiProperty({
    type: 'integer',
    description: 'What the attorney keeps after Stripe (estimate).',
  })
  attorneyReceivesCents!: number;
  @ApiProperty({ enum: FEE_TYPES, enumName: 'PaymentFeeType' })
  feeType!: FeeType;
  @ApiProperty({ enum: FEE_PAYERS, enumName: 'PaymentFeePayer' })
  feePayer!: FeePayer;
  @ApiProperty({ enum: PROCESSING_FEE_PAYERS, enumName: 'ProcessingFeePayer' })
  processingFeePayer!: ProcessingFeePayer;
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
  @ApiProperty({ enum: PROCESSING_FEE_PAYERS, enumName: 'ProcessingFeePayer' })
  processingFeePayer!: ProcessingFeePayer;
  @ApiProperty({ description: "Stripe's card rate used for estimates." })
  processingFeePercent!: number;
  @ApiProperty({ type: 'integer' }) processingFeeFixedCents!: number;
  @ApiProperty() saveCards!: boolean;
  @ApiProperty() allowInvoices!: boolean;
  @ApiProperty() allowInstallments!: boolean;
  @ApiProperty({ type: 'integer' }) maxInstallments!: number;
  @ApiProperty({ type: 'integer' }) feePayerMaxRounds!: number;
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

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      "Quote for this case: the attorney's fee-payer choice applies.",
  })
  @IsOptional()
  @IsUUID('all')
  caseId?: string;

  @ApiPropertyOptional({
    enum: PROCESSING_FEE_PAYERS,
    enumName: 'ProcessingFeePayer',
    description: 'Preview a specific choice (attorney composing an invoice).',
  })
  @IsOptional()
  @IsIn(PROCESSING_FEE_PAYERS)
  processingFeePayer?: ProcessingFeePayer;
}

// ---- payout account (attorney) --------------------------------------------

/** `PUT /payout-account/preferences` — the attorney's own defaults. */
export class PayoutPreferencesDto {
  @ApiProperty({
    enum: PROCESSING_FEE_PAYERS,
    enumName: 'ProcessingFeePayer',
    description: "Who covers Stripe's card fee on this attorney's invoices.",
  })
  @IsIn(PROCESSING_FEE_PAYERS)
  processingFeePayer!: ProcessingFeePayer;
}

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
  @ApiProperty({
    enum: PROCESSING_FEE_PAYERS,
    enumName: 'ProcessingFeePayer',
    description: "The attorney's default for who covers Stripe's fee.",
  })
  processingFeePayer!: ProcessingFeePayer;
  @ApiProperty({
    description: 'True while the attorney has not chosen (admin default).',
  })
  processingFeePayerIsDefault!: boolean;
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
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The payment request this pays (kind = invoice).',
  })
  requestId!: string | null;
  @ApiProperty({ enum: PAYMENT_STATUSES, enumName: 'CasePaymentStatus' })
  status!: PaymentStatus;
  @ApiProperty({ type: 'integer' }) amountCents!: number;
  @ApiProperty({ type: 'integer' }) platformFeeCents!: number;
  @ApiProperty({ type: 'integer' }) processingFeeCents!: number;
  @ApiProperty({ type: 'integer' }) clientTotalCents!: number;
  @ApiProperty({ type: 'integer' }) attorneyNetCents!: number;
  @ApiProperty({ enum: PROCESSING_FEE_PAYERS, enumName: 'ProcessingFeePayer' })
  processingFeePayer!: ProcessingFeePayer;
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

// ---- payment requests (invoices) --------------------------------------------

export class PaymentRequestDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) caseId!: string;
  @ApiProperty({ type: String, nullable: true }) caseTitle!: string | null;
  @ApiProperty({ type: 'integer' }) amountCents!: number;
  @ApiProperty() description!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  dueAt!: string | null;
  @ApiProperty({ enum: PROCESSING_FEE_PAYERS, enumName: 'ProcessingFeePayer' })
  processingFeePayer!: ProcessingFeePayer;
  @ApiProperty({
    type: 'integer',
    description: "The client's share of Stripe's fee (estimate).",
  })
  processingFeeCents!: number;
  @ApiProperty({
    type: 'integer',
    description: 'What the client is charged in total (estimate).',
  })
  clientTotalCents!: number;
  @ApiProperty({
    type: 'integer',
    description: 'What the attorney receives after Stripe (estimate).',
  })
  attorneyReceivesCents!: number;
  @ApiProperty({
    enum: FEE_PAYER_STATUSES,
    enumName: 'FeePayerStatus',
    description:
      'Agreed like a bid: proposed (by the attorney with the invoice), countered, agreed.',
  })
  feePayerStatus!: FeePayerStatus;
  @ApiProperty({
    enum: FEE_PAYER_PARTIES,
    enumName: 'FeePayerParty',
    description: 'Who made the current proposal; the other side answers.',
  })
  feePayerBy!: FeePayerParty;
  @ApiProperty({ type: 'integer', description: 'Counter-offers so far.' })
  feePayerRounds!: number;
  @ApiProperty({ type: 'integer', description: 'Admin cap on counter-offers.' })
  feePayerMaxRounds!: number;
  @ApiProperty({
    description:
      "The client may pay now: agreed, or it is the attorney's proposal (paying accepts it).",
  })
  canPay!: boolean;
  @ApiProperty({
    enum: PAYMENT_REQUEST_STATUSES,
    enumName: 'PaymentRequestStatus',
  })
  status!: PaymentRequestStatus;
  @ApiProperty({ description: 'Open and past its due date.' })
  overdue!: boolean;
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Installment plan this belongs to.',
  })
  planId!: string | null;
  @ApiProperty({ type: 'integer', description: '1-based installment number.' })
  seq!: number;
  @ApiProperty({ type: 'integer', description: 'Installments in the plan.' })
  total!: number;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  paymentId!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  paidAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: CasePaymentPartyDto, nullable: true })
  client!: CasePaymentPartyDto | null;
  @ApiProperty({ type: CasePaymentPartyDto, nullable: true })
  attorney!: CasePaymentPartyDto | null;
}

export class PaymentRequestItemDto {
  @ApiProperty({ type: 'integer', minimum: 50 })
  @IsInt()
  @Min(50)
  @Max(100_000_000)
  amountCents!: number;

  @ApiPropertyOptional({
    maxLength: 200,
    description: 'What this is for; defaults to the plan description.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class CreatePaymentRequestsDto {
  @ApiProperty({
    maxLength: 200,
    description: 'What the client pays for (shown on every installment).',
  })
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  description!: string;

  @ApiPropertyOptional({
    enum: PROCESSING_FEE_PAYERS,
    enumName: 'ProcessingFeePayer',
    description:
      "Who covers Stripe's fee on these invoices; defaults to the attorney's setting.",
  })
  @IsOptional()
  @IsIn(PROCESSING_FEE_PAYERS)
  processingFeePayer?: ProcessingFeePayer;

  @ApiProperty({
    type: [PaymentRequestItemDto],
    description: 'One item = one request; several = an installment plan.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(36)
  @ValidateNested({ each: true })
  @Type(() => PaymentRequestItemDto)
  items!: PaymentRequestItemDto[];
}

/** `POST /payment-requests/:id/fee-payer` — accept the other side's
 * proposal or counter with another option. */
export class FeePayerAnswerDto {
  @ApiProperty({ enum: ['accept', 'counter'] })
  @IsIn(['accept', 'counter'])
  action!: 'accept' | 'counter';

  @ApiPropertyOptional({
    enum: PROCESSING_FEE_PAYERS,
    enumName: 'ProcessingFeePayer',
    description: 'Required for counter.',
  })
  @IsOptional()
  @IsIn(PROCESSING_FEE_PAYERS)
  processingFeePayer?: ProcessingFeePayer;
}

export class PaymentRequestIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class PaymentsExportQueryDto {
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  to?: string;
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
  @ApiProperty({
    enum: PROCESSING_FEE_PAYERS,
    enumName: 'ProcessingFeePayer',
    description:
      "The attorney's default for who covers Stripe's fee on this case.",
  })
  processingFeePayer!: ProcessingFeePayer;
  @ApiProperty({
    description:
      'The attorney (or their assistant) may send a payment request now.',
  })
  canRequest!: boolean;
  @ApiProperty() allowInstallments!: boolean;
  @ApiProperty({ type: 'integer' }) maxInstallments!: number;
  @ApiProperty({ type: 'integer', description: 'Sum of open requests.' })
  openRequestsCents!: number;
  @ApiProperty({ type: [PaymentRequestDto], description: 'Newest first.' })
  requests!: PaymentRequestDto[];
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

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required for kind = invoice: the open payment request.',
  })
  @IsOptional()
  @IsUUID('all')
  requestId?: string;
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

  @ApiProperty({ enum: PROCESSING_FEE_PAYERS, enumName: 'ProcessingFeePayer' })
  @IsIn(PROCESSING_FEE_PAYERS)
  processingFeePayer!: ProcessingFeePayer;

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

  @ApiProperty()
  @IsBoolean()
  saveCards!: boolean;

  @ApiProperty()
  @IsBoolean()
  allowInvoices!: boolean;

  @ApiProperty()
  @IsBoolean()
  allowInstallments!: boolean;

  @ApiProperty({ type: 'integer', minimum: 2, maximum: 36 })
  @IsInt()
  @Min(2)
  @Max(36)
  maxInstallments!: number;

  @ApiProperty({
    type: 'integer',
    minimum: 0,
    maximum: 20,
    description:
      'Counter-offers allowed while agreeing who covers the Stripe fee (0 = accept or pay only).',
  })
  @IsInt()
  @Min(0)
  @Max(20)
  feePayerMaxRounds!: number;

  @ApiProperty({
    type: [Number],
    description: 'Days before the due date to remind the client.',
  })
  @IsArray()
  @ArrayMaxSize(6)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(60, { each: true })
  invoiceReminderDays!: number[];

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 60 })
  @IsInt()
  @Min(0)
  @Max(60)
  overdueReminderEveryDays!: number;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 365 })
  @IsInt()
  @Min(0)
  @Max(365)
  invoiceExpireDays!: number;

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
  @ApiProperty({ type: 'integer', description: 'Open payment requests.' })
  openRequests!: number;
  @ApiProperty({ type: 'integer' }) openRequestsCents!: number;
  @ApiProperty({ type: 'integer' }) overdueRequests!: number;
}

export class AdminPaymentRequestsQueryDto extends CasePaymentsCursorQueryDto {
  @ApiPropertyOptional({
    enum: PAYMENT_REQUEST_STATUSES,
    enumName: 'PaymentRequestStatus',
  })
  @IsOptional()
  @IsIn(PAYMENT_REQUEST_STATUSES)
  status?: PaymentRequestStatus;

  @ApiPropertyOptional({ format: 'uuid', description: 'Client or attorney.' })
  @IsOptional()
  @IsUUID('all')
  userId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  caseId?: string;
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
  @ApiProperty({
    enum: PROCESSING_FEE_PAYERS,
    enumName: 'ProcessingFeePayer',
    nullable: true,
    description: "The attorney's own fee-payer choice; null = admin default.",
  })
  processingFeePayer!: ProcessingFeePayer | null;
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
