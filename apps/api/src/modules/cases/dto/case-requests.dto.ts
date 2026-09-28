import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BudgetMode } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

// docs/04_CASES_BIDS.md §3.2.
export const TITLE_MIN = 10;
export const TITLE_MAX = 120;
export const DESCRIPTION_MIN = 30;
export const DESCRIPTION_MAX = 5000;
export const CITY_MAX = 80;
export const BUDGET_MIN_DOLLARS = 1;
export const BUDGET_MAX_DOLLARS = 10_000_000;
export const MAX_ADDITIONAL_STATES = 2;

export const MY_CASES_PAGE_DEFAULT = 20;
export const MY_CASES_PAGE_MAX = 50;

const STATE_CODE_RE = /^[A-Z]{2}$/;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const trimToNull = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export class CaseIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

/** POST /cases (docs/04 §3.1–§3.4). Budget is entered in whole dollars and
 * stored in cents (service multiplies by 100; .cursorrules "Деньги только
 * в центах"). `clientContactSharingConsent` only needs to be `true` when
 * the client hasn't granted that consent before (§3.1 step 5 — the app
 * shows the checkbox only for a client's first case, but the gate itself
 * is "not yet granted", not "first case"). */
export class CreateCaseDto {
  @ApiProperty({ format: 'uuid', description: 'A leaf (specialization).' })
  @IsUUID('all')
  practiceAreaId!: string;

  @ApiProperty({ minLength: TITLE_MIN, maxLength: TITLE_MAX })
  @Transform(trim)
  @IsString()
  @MinLength(TITLE_MIN)
  @MaxLength(TITLE_MAX)
  title!: string;

  @ApiProperty({ minLength: DESCRIPTION_MIN, maxLength: DESCRIPTION_MAX })
  @Transform(trim)
  @IsString()
  @MinLength(DESCRIPTION_MIN)
  @MaxLength(DESCRIPTION_MAX)
  description!: string;

  @ApiProperty({ pattern: '^[A-Z]{2}$', example: 'NY' })
  @IsString()
  @Matches(STATE_CODE_RE)
  primaryStateCode!: string;

  @ApiPropertyOptional({
    type: [String],
    maxItems: MAX_ADDITIONAL_STATES,
    description: '0-2 more states, distinct from the primary and each other.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ADDITIONAL_STATES)
  @ArrayUnique()
  @Matches(STATE_CODE_RE, { each: true })
  additionalStateCodes?: string[];

  @ApiPropertyOptional({ maxLength: CITY_MAX, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(CITY_MAX)
  city?: string | null;

  @ApiProperty({ enum: BudgetMode, enumName: 'BudgetMode' })
  @IsEnum(BudgetMode)
  budgetMode!: BudgetMode;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: BUDGET_MIN_DOLLARS,
    maximum: BUDGET_MAX_DOLLARS,
    description: 'Required (and only meaningful) when budgetMode = amount.',
  })
  @ValidateIf((o: CreateCaseDto) => o.budgetMode === 'amount')
  @IsInt()
  @Min(BUDGET_MIN_DOLLARS)
  @Max(BUDGET_MAX_DOLLARS)
  budgetAmountDollars?: number;

  @ApiPropertyOptional({
    description:
      'Must be true unless the client already granted client_contact_sharing on an earlier case.',
  })
  @IsOptional()
  @IsBoolean()
  clientContactSharingConsent?: boolean;
}

/** PATCH /cases/:id (docs/04 §3.5). Every field is optional; at least one
 * must be sent. practiceAreaId / states are only accepted while the case
 * has no bids (CasesService checks bids_count, not this DTO). Changing
 * states means sending the full desired set (primary + additional), not a
 * partial patch of one state. */
export class UpdateCaseDto {
  @ApiPropertyOptional({ minLength: TITLE_MIN, maxLength: TITLE_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(TITLE_MIN)
  @MaxLength(TITLE_MAX)
  title?: string;

  @ApiPropertyOptional({
    minLength: DESCRIPTION_MIN,
    maxLength: DESCRIPTION_MAX,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(DESCRIPTION_MIN)
  @MaxLength(DESCRIPTION_MAX)
  description?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'A leaf (specialization).',
  })
  @IsOptional()
  @IsUUID('all')
  practiceAreaId?: string;

  @ApiPropertyOptional({ pattern: '^[A-Z]{2}$', example: 'NY' })
  @IsOptional()
  @IsString()
  @Matches(STATE_CODE_RE)
  primaryStateCode?: string;

  @ApiPropertyOptional({ type: [String], maxItems: MAX_ADDITIONAL_STATES })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ADDITIONAL_STATES)
  @ArrayUnique()
  @Matches(STATE_CODE_RE, { each: true })
  additionalStateCodes?: string[];

  @ApiPropertyOptional({ maxLength: CITY_MAX, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(CITY_MAX)
  city?: string | null;

  @ApiPropertyOptional({ enum: BudgetMode, enumName: 'BudgetMode' })
  @IsOptional()
  @IsEnum(BudgetMode)
  budgetMode?: BudgetMode;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: BUDGET_MIN_DOLLARS,
    maximum: BUDGET_MAX_DOLLARS,
  })
  @ValidateIf((o: UpdateCaseDto) => o.budgetMode === 'amount')
  @IsInt()
  @Min(BUDGET_MIN_DOLLARS)
  @Max(BUDGET_MAX_DOLLARS)
  budgetAmountDollars?: number;
}

export type MyCasesFilter = 'active' | 'archived' | 'closed';
export const MY_CASES_FILTERS: readonly MyCasesFilter[] = [
  'active',
  'archived',
  'closed',
];

/** GET /users/me/cases (docs/04 §11.1, §15). */
export class ListMyCasesQueryDto {
  @ApiPropertyOptional({ enum: MY_CASES_FILTERS, default: 'active' })
  @IsOptional()
  @IsIn(MY_CASES_FILTERS)
  filter?: MyCasesFilter;

  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: MY_CASES_PAGE_MAX,
    default: MY_CASES_PAGE_DEFAULT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MY_CASES_PAGE_MAX)
  limit?: number;
}
