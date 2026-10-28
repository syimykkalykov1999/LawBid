import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeeType, StartAvailability } from '@prisma/client';
import { PERCENT_BPS_MAX, PERCENT_BPS_MIN } from '../../cases/cases.public';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  INSTALLMENT_PERIODS,
  PAYMENT_TERMS_AMOUNT_MAX_CENTS,
  PAYMENT_TERMS_BPS_MAX,
  PAYMENT_TERMS_HOURS_MAX,
  PAYMENT_TERMS_INSTALLMENTS_MAX,
  PAYMENT_TERMS_NOTES_MAX,
  PAYMENT_TERMS_TYPES,
  type InstallmentPeriod,
  type PaymentTermsType,
} from '../domain/payment-terms';
import { MaxTextChars } from '../../../common/app-settings/max-text-chars.decorator';

/** docs/04_CASES_BIDS.md §3.2 / §5.1: money in cents, up to $10,000,000. */
export const BID_AMOUNT_MAX_CENTS = 1_000_000_000;
export const BID_MESSAGE_MIN = 20;
export const BID_MESSAGE_MAX = 2000;
export const COUNTER_MESSAGE_MAX = 500;
export const ESTIMATED_DURATION_MAX_DAYS = 3650;

export class CaseIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  caseId!: string;
}

export class BidIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

const trimToNull = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/**
 * POST /cases/:caseId/bids (§5.1). `amountCents` is required for `fixed`/
 * `hourly` and ignored (stored as 0) for `free_consultation` — enforced in
 * BidsService, since "required unless X" isn't expressible with a single
 * decorator combination that also rejects a stray value cleanly.
 */
/**
 * Deal record 2026-10-27: rich payment terms (plan §2.3). Field rules per
 * `type` live in `domain/payment-terms.ts` (PAYMENT_TERMS_INVALID); this
 * class only shapes the JSON. Accepted only while `bids.rich_terms_enabled`.
 */
export class PaymentTermsDto {
  @ApiProperty({ type: 'integer', example: 1 })
  @IsInt()
  version!: number;

  @ApiProperty({ enum: PAYMENT_TERMS_TYPES })
  @IsIn(PAYMENT_TERMS_TYPES)
  type!: PaymentTermsType;

  @ApiProperty({ enum: ['USD'] })
  @IsIn(['USD'])
  currency!: 'USD';

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: PAYMENT_TERMS_AMOUNT_MAX_CENTS,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PAYMENT_TERMS_AMOUNT_MAX_CENTS)
  flatCents?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: PAYMENT_TERMS_AMOUNT_MAX_CENTS,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PAYMENT_TERMS_AMOUNT_MAX_CENTS)
  hourlyRateCents?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: PAYMENT_TERMS_HOURS_MAX,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PAYMENT_TERMS_HOURS_MAX)
  estimatedHoursMin?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: PAYMENT_TERMS_HOURS_MAX,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PAYMENT_TERMS_HOURS_MAX)
  estimatedHoursMax?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: PAYMENT_TERMS_BPS_MAX,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PAYMENT_TERMS_BPS_MAX)
  contingencyBps?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: PAYMENT_TERMS_AMOUNT_MAX_CENTS,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PAYMENT_TERMS_AMOUNT_MAX_CENTS)
  retainerCents?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: PAYMENT_TERMS_AMOUNT_MAX_CENTS,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PAYMENT_TERMS_AMOUNT_MAX_CENTS)
  installmentCents?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: PAYMENT_TERMS_INSTALLMENTS_MAX,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PAYMENT_TERMS_INSTALLMENTS_MAX)
  installmentCount?: number;

  @ApiPropertyOptional({ enum: INSTALLMENT_PERIODS })
  @IsOptional()
  @IsIn(INSTALLMENT_PERIODS)
  installmentPeriod?: InstallmentPeriod;

  @ApiPropertyOptional({ maxLength: PAYMENT_TERMS_NOTES_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(PAYMENT_TERMS_NOTES_MAX)
  notes?: string;
}

export class CreateBidDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Firm lawyer who sends the bid (must hold a matching verified licence); default: the caller.',
  })
  @IsOptional()
  @IsUUID()
  sendAsAttorneyId?: string;

  @ApiPropertyOptional({
    type: () => PaymentTermsDto,
    description:
      'Deal record 2026-10-27: rich payment terms; only while `bids.rich_terms_enabled` (else 400 PAYMENT_TERMS_DISABLED).',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentTermsDto)
  paymentTerms?: PaymentTermsDto;

  @ApiProperty({ enum: FeeType, enumName: 'FeeType' })
  @IsEnum(FeeType)
  feeType!: FeeType;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: BID_AMOUNT_MAX_CENTS,
    description:
      'Required for fixed/hourly; ignored (stored as 0) for free_consultation.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(BID_AMOUNT_MAX_CENTS)
  amountCents?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: PERCENT_BPS_MIN,
    maximum: PERCENT_BPS_MAX,
    description:
      'Owner 2026-10-17: required for contingency — basis points (3300 = 33 %), capped by `fees.contingency_max_percent`.',
  })
  @ValidateIf((o: CreateBidDto) => o.feeType === 'contingency')
  @IsInt()
  @Min(PERCENT_BPS_MIN)
  @Max(PERCENT_BPS_MAX)
  percentBps?: number;

  @ApiProperty({ minLength: BID_MESSAGE_MIN, maxLength: BID_MESSAGE_MAX })
  @IsString()
  @MinLength(BID_MESSAGE_MIN)
  @MaxTextChars('limits.bid_message_chars')
  message!: string;

  @ApiProperty({ enum: StartAvailability, enumName: 'StartAvailability' })
  @IsEnum(StartAvailability)
  startAvailability!: StartAvailability;

  @ApiPropertyOptional({
    format: 'date',
    description: 'Required when startAvailability = custom_date; not past.',
  })
  @ValidateIf((o: CreateBidDto) => o.startAvailability === 'custom_date')
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: ESTIMATED_DURATION_MAX_DAYS,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(ESTIMATED_DURATION_MAX_DAYS)
  estimatedDurationDays?: number;
}

/** POST /bids/:id/counter (§6.3). The fee type never changes in a
 * counter-offer — only the amount (or, for contingency, the percent) is
 * negotiated (§6.1). */
export class CounterOfferDto {
  @ApiPropertyOptional({
    type: () => PaymentTermsDto,
    description:
      "Deal record 2026-10-27: the rich payment terms of this round (replaces the previous round's); only while `bids.rich_terms_enabled`.",
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentTermsDto)
  paymentTerms?: PaymentTermsDto;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: BID_AMOUNT_MAX_CENTS,
    description: 'Required unless the bid is contingency.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(BID_AMOUNT_MAX_CENTS)
  amountCents?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: PERCENT_BPS_MIN,
    maximum: PERCENT_BPS_MAX,
    description: 'Owner 2026-10-17: required for a contingency bid.',
  })
  @IsOptional()
  @IsInt()
  @Min(PERCENT_BPS_MIN)
  @Max(PERCENT_BPS_MAX)
  percentBps?: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: COUNTER_MESSAGE_MAX,
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxTextChars('limits.counter_message_chars')
  message?: string | null;
}
