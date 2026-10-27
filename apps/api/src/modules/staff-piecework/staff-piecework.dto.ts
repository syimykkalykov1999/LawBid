import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PIECEWORK_RATE_KINDS } from './piecework.calc';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** $1,000 per unit is far above any piece rate; a typo guard. */
export const RATE_MAX_CENTS = 100_000;

export const PIECEWORK_WORKSPACES = ['mass', 'finance', 'owner'] as const;
export const PIECEWORK_DAY_STATUSES = [
  'accrued',
  'no_rating',
  'reversed',
  'no_payroll',
  'disputed',
] as const;

// ---------------------------------------------------------------- rates

export class SetStaffRateDto {
  @ApiProperty({ enum: PIECEWORK_RATE_KINDS })
  @IsIn(PIECEWORK_RATE_KINDS)
  kind!: string;

  @ApiProperty({ enum: PIECEWORK_WORKSPACES })
  @IsIn(PIECEWORK_WORKSPACES)
  workspace!: string;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: RATE_MAX_CENTS })
  @IsInt()
  @Min(1)
  @Max(RATE_MAX_CENTS)
  amountCents!: number;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'From when the rate counts (default now; never in the past).',
  })
  @IsOptional()
  @IsISO8601()
  validFrom?: string;

  @ApiPropertyOptional({
    type: 'number',
    minimum: 1,
    maximum: 2,
    description: 'Weekly quest multiplier (×1.20), capped by the setting.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(2)
  boostMult?: number;
}

export class StaffRateDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: PIECEWORK_RATE_KINDS }) kind!: string;
  @ApiProperty({ enum: PIECEWORK_WORKSPACES }) workspace!: string;
  @ApiProperty({ type: 'integer' }) amountCents!: number;
  @ApiProperty() currency!: string;
  @ApiProperty({ format: 'date-time' }) validFrom!: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  validTo!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true })
  boostMult!: number | null;
  @ApiProperty({ description: 'In force right now.' }) active!: boolean;
}

export class StaffRateIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

// ------------------------------------------------------- piecework days

export class PieceworkQueryDto {
  @ApiPropertyOptional({
    example: '2026-10',
    description: 'Month, YYYY-MM (default: this month, UTC).',
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period?: string;
}

export class PieceworkDayParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  adminId!: string;

  @ApiProperty({ example: '2026-10-26' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  day!: string;
}

export class DisputePieceworkDto {
  @ApiProperty({ minLength: 3, maxLength: 200 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  reason!: string;
}

export class PieceworkKindDto {
  @ApiProperty({ enum: PIECEWORK_RATE_KINDS }) kind!: string;
  @ApiProperty({ type: 'integer' }) units!: number;
  @ApiProperty({
    type: 'integer',
    description: 'Overturned on re-check, not paid.',
  })
  heldUnits!: number;
  @ApiProperty({ type: 'integer' }) rateCents!: number;
  @ApiProperty({ type: 'integer' }) amountCents!: number;
}

export class PieceworkDayDto {
  @ApiProperty({ example: '2026-10-26' }) day!: string;
  @ApiProperty({ type: 'integer' }) units!: number;
  @ApiProperty({ type: 'integer' }) heldUnits!: number;
  @ApiProperty({ type: 'number', example: 1.1 }) qualityMult!: number;
  @ApiProperty({ type: 'integer' }) amountCents!: number;
  @ApiProperty({ enum: PIECEWORK_DAY_STATUSES }) status!: string;
  @ApiProperty({ description: 'No rating snapshot: counted at ×1.00.' })
  noRating!: boolean;
  @ApiPropertyOptional({
    type: () => [PieceworkKindDto],
    nullable: true,
    description: 'Per kind with the rate used; the owner only.',
  })
  kinds!: PieceworkKindDto[] | null;
}

export class PieceworkPersonDto {
  @ApiProperty({ format: 'uuid' }) adminId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: PIECEWORK_WORKSPACES }) workspace!: string;
  @ApiProperty({ type: 'integer' }) units!: number;
  @ApiProperty({ type: 'integer' }) heldUnits!: number;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Month total, cents; hidden from a head (totals only).',
  })
  amountCents!: number | null;
  @ApiProperty({
    type: () => [PieceworkDayDto],
    description: 'Empty for a head (totals only).',
  })
  days!: PieceworkDayDto[];
}

export class PieceworkTotalsDto {
  @ApiProperty({ type: 'integer' }) people!: number;
  @ApiProperty({ type: 'integer' }) units!: number;
  @ApiProperty({ type: 'integer' }) heldUnits!: number;
  @ApiProperty({ type: 'integer' }) amountCents!: number;
}

export class PieceworkOverviewDto {
  @ApiProperty({ example: '2026-10' }) period!: string;
  @ApiProperty({ enum: ['owner', 'head', 'self'] }) scope!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ type: () => PieceworkTotalsDto })
  totals!: PieceworkTotalsDto;
  @ApiProperty({ type: () => [PieceworkPersonDto] })
  people!: PieceworkPersonDto[];
}

export class PieceworkDisputeResultDto {
  @ApiProperty({ enum: ['disputed'] }) status!: string;
  @ApiProperty({
    enum: ['canceled', 'paid', 'none'],
    description:
      'What happened to the pending payroll accrual (paid: already paid out).',
  })
  accrual!: string;
}

export class PieceworkPaidDiffDto {
  @ApiProperty({ format: 'uuid' }) adminId!: string;
  @ApiProperty({ type: 'integer' }) deltaCents!: number;
}

export class PieceworkRerunResultDto {
  @ApiProperty() day!: string;
  @ApiProperty({ type: 'integer' }) admins!: number;
  @ApiProperty({ type: 'integer' }) accrued!: number;
  @ApiProperty({ type: 'integer' }) totalCents!: number;
  @ApiProperty({ type: 'integer' }) skippedNoPayroll!: number;
  @ApiProperty({ type: 'integer' }) skippedDisputed!: number;
  @ApiProperty({ type: 'integer' }) noRating!: number;
  @ApiProperty({
    type: () => [PieceworkPaidDiffDto],
    description:
      'Days already paid whose recount differs: add an adjustment in payroll.',
  })
  paidDiffs!: PieceworkPaidDiffDto[];
}
