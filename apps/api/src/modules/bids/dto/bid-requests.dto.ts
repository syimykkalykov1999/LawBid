import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeeType, StartAvailability } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

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
export class CreateBidDto {
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

  @ApiProperty({ minLength: BID_MESSAGE_MIN, maxLength: BID_MESSAGE_MAX })
  @IsString()
  @MinLength(BID_MESSAGE_MIN)
  @MaxLength(BID_MESSAGE_MAX)
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
 * counter-offer — only the amount is negotiated (§6.1). */
export class CounterOfferDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: BID_AMOUNT_MAX_CENTS })
  @IsInt()
  @Min(1)
  @Max(BID_AMOUNT_MAX_CENTS)
  amountCents!: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: COUNTER_MESSAGE_MAX,
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(COUNTER_MESSAGE_MAX)
  message?: string | null;
}
