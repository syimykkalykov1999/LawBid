import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const JURISDICTION = /^[A-Z]{2}$/;

export const DEADLINE_KINDS = ['court_deadline', 'statute_of_limitations'] as const;
export const DEADLINE_UNITS = ['day', 'month', 'year'] as const;
export const DEADLINE_DAY_TYPES = ['calendar', 'business'] as const;
export const DEADLINE_DIRECTIONS = ['after', 'before'] as const;

export class DeadlineRuleDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'US', description: 'US = federal courts; otherwise a state code.' })
  jurisdiction!: string;
  @ApiProperty({ enum: DEADLINE_KINDS, enumName: 'DeadlineKind' })
  kind!: (typeof DEADLINE_KINDS)[number];
  @ApiProperty({ example: 'frcp_12a_answer' }) code!: string;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  labels!: Record<string, string>;
  @ApiProperty({ type: 'integer' }) amount!: number;
  @ApiProperty({ enum: DEADLINE_UNITS, enumName: 'DeadlineUnit' })
  unit!: (typeof DEADLINE_UNITS)[number];
  @ApiProperty({ enum: DEADLINE_DAY_TYPES, enumName: 'DeadlineDayType' })
  dayType!: (typeof DEADLINE_DAY_TYPES)[number];
  @ApiProperty({ enum: DEADLINE_DIRECTIONS, enumName: 'DeadlineDirection' })
  direction!: (typeof DEADLINE_DIRECTIONS)[number];
  @ApiPropertyOptional({ type: String, nullable: true })
  practiceCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  citation!: string | null;
  @ApiPropertyOptional({ type: 'object', additionalProperties: { type: 'string' }, nullable: true })
  notes!: Record<string, string> | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  sourceUrl!: string | null;
  @ApiProperty({ description: 'Checked against the source by staff.' })
  verified!: boolean;
}

export class AdminDeadlineRuleDto extends DeadlineRuleDto {
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: 'integer' }) sort!: number;
}

export class DeadlineRulesQueryDto {
  @ApiPropertyOptional({ example: 'NY', description: 'Federal rules plus this state’s.' })
  @IsOptional()
  @Matches(JURISDICTION)
  jurisdiction?: string;

  @ApiPropertyOptional({ enum: DEADLINE_KINDS })
  @IsOptional()
  @IsIn(DEADLINE_KINDS)
  kind?: (typeof DEADLINE_KINDS)[number];

  @ApiPropertyOptional({ description: 'Statutes for this practice category code.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  practiceCode?: string;
}

export class DeadlineCalcQueryDto {
  @ApiProperty({ example: 'frcp_12a_answer' })
  @IsString()
  @MaxLength(80)
  ruleCode!: string;

  @ApiProperty({ example: '2026-10-05', description: 'The event date (service, ruling, accident…).' })
  @Matches(ISO_DATE)
  eventDate!: string;
}

export class DeadlineHolidayDto {
  @ApiProperty({ example: '2026-12-25' }) date!: string;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  names!: Record<string, string>;
}

export class DeadlineHolidaysQueryDto {
  @ApiPropertyOptional({ example: 'US', default: 'US' })
  @IsOptional()
  @Matches(JURISDICTION)
  jurisdiction?: string;

  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;
}

export const DEADLINE_WARNINGS = [
  'holidays_missing',
  'unverified',
  'rolled',
] as const;

export class DeadlineResultDto {
  @ApiProperty({ type: DeadlineRuleDto }) rule!: DeadlineRuleDto;
  @ApiProperty({ example: '2026-10-05' }) eventDate!: string;
  @ApiProperty({ example: '2026-10-26', description: 'The last day.' }) dueDate!: string;
  @ApiProperty({ example: '2026-10-25', description: 'The date before moving past a weekend or holiday.' })
  rawDate!: string;
  @ApiProperty() rolled!: boolean;
  @ApiProperty({ type: [DeadlineHolidayDto] }) holidays!: DeadlineHolidayDto[];
  @ApiProperty({
    type: String,
    isArray: true,
    enum: DEADLINE_WARNINGS,
    description:
      'holidays_missing: court holidays of that year are not loaded; unverified: the rule is not checked by staff yet; rolled: moved past a weekend or holiday.',
  })
  warnings!: string[];
}

// --- admin ----------------------------------------------------------------------

export class CreateDeadlineRuleDto {
  @ApiProperty({ example: 'US' })
  @Matches(JURISDICTION)
  jurisdiction!: string;

  @ApiProperty({ enum: DEADLINE_KINDS })
  @IsIn(DEADLINE_KINDS)
  kind!: (typeof DEADLINE_KINDS)[number];

  @ApiProperty({ example: 'ny_cplr_3211_answer', pattern: '^[a-z0-9_]{3,80}$' })
  @Matches(/^[a-z0-9_]{3,80}$/)
  code!: string;

  @ApiProperty({ example: { en: 'Answer', ru: 'Ответ' } })
  @IsObject()
  labels!: Record<string, string>;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 3650 })
  @IsInt()
  @Min(1)
  @Max(3650)
  amount!: number;

  @ApiPropertyOptional({ enum: DEADLINE_UNITS, default: 'day' })
  @IsOptional()
  @IsIn(DEADLINE_UNITS)
  unit?: (typeof DEADLINE_UNITS)[number];

  @ApiPropertyOptional({ enum: DEADLINE_DAY_TYPES, default: 'calendar' })
  @IsOptional()
  @IsIn(DEADLINE_DAY_TYPES)
  dayType?: (typeof DEADLINE_DAY_TYPES)[number];

  @ApiPropertyOptional({ enum: DEADLINE_DIRECTIONS, default: 'after' })
  @IsOptional()
  @IsIn(DEADLINE_DIRECTIONS)
  direction?: (typeof DEADLINE_DIRECTIONS)[number];

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  practiceCode?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  citation?: string;

  @ApiPropertyOptional({ example: { en: 'Counted from the day after service.' } })
  @IsOptional()
  @IsObject()
  notes?: Record<string, string>;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  sourceUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: 'integer', default: 0 })
  @IsOptional()
  @IsInt()
  sort?: number;
}

/** Every field optional; `code` and `jurisdiction` never change. */
export class UpdateDeadlineRuleDto {
  @ApiPropertyOptional({ enum: DEADLINE_KINDS })
  @IsOptional()
  @IsIn(DEADLINE_KINDS)
  kind?: (typeof DEADLINE_KINDS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  labels?: Record<string, string>;

  @ApiPropertyOptional({ type: 'integer' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  amount?: number;

  @ApiPropertyOptional({ enum: DEADLINE_UNITS })
  @IsOptional()
  @IsIn(DEADLINE_UNITS)
  unit?: (typeof DEADLINE_UNITS)[number];

  @ApiPropertyOptional({ enum: DEADLINE_DAY_TYPES })
  @IsOptional()
  @IsIn(DEADLINE_DAY_TYPES)
  dayType?: (typeof DEADLINE_DAY_TYPES)[number];

  @ApiPropertyOptional({ enum: DEADLINE_DIRECTIONS })
  @IsOptional()
  @IsIn(DEADLINE_DIRECTIONS)
  direction?: (typeof DEADLINE_DIRECTIONS)[number];

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  practiceCode?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  citation?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  notes?: Record<string, string>;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  sourceUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: 'integer' })
  @IsOptional()
  @IsInt()
  sort?: number;
}

export class DeadlineIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class AdminHolidaysQueryDto {
  @ApiPropertyOptional({ example: 'US' })
  @IsOptional()
  @Matches(JURISDICTION)
  jurisdiction?: string;

  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}

export class AdminHolidayDto extends DeadlineHolidayDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() jurisdiction!: string;
}

export class CreateHolidayDto {
  @ApiProperty({ example: 'NY' })
  @Matches(JURISDICTION)
  jurisdiction!: string;

  @ApiProperty({ example: '2026-11-03' })
  @Matches(ISO_DATE)
  date!: string;

  @ApiProperty({ example: { en: 'Election Day' } })
  @IsObject()
  names!: Record<string, string>;
}

export class GenerateFederalHolidaysDto {
  @ApiProperty({ example: 2028 })
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;
}

export class GenerateFederalHolidaysResultDto {
  @ApiProperty({ type: 'integer' }) created!: number;
  @ApiProperty({ type: 'integer' }) existing!: number;
}
