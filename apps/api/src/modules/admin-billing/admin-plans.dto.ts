import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  AUDIENCES,
  EntitlementDefDto,
  LocalizedTextDto,
  PublicPlanDto,
} from '../../modules/plans/plans.dto';
import type { Audience } from '../../modules/plans/entitlement-catalog';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class LocalizedTextInputDto {
  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  en?: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  ru?: string;
}

export class LongLocalizedTextInputDto {
  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  en?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  ru?: string;
}

export class PlanFieldsDto {
  @ApiPropertyOptional({ type: LocalizedTextInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTextInputDto)
  name?: LocalizedTextInputDto;

  @ApiPropertyOptional({ type: LocalizedTextInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTextInputDto)
  tagline?: LocalizedTextInputDto;

  @ApiPropertyOptional({ type: LongLocalizedTextInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LongLocalizedTextInputDto)
  description?: LongLocalizedTextInputDto;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      'Entitlement values {key: boolean | number | null}; unknown keys are dropped.',
  })
  @IsOptional()
  @IsObject()
  entitlements?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [LocalizedTextInputDto], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LocalizedTextInputDto)
  highlights?: LocalizedTextInputDto[];

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 100,
    maximum: 10_000_000,
    description:
      'Price per interval in cents; a change creates a new Stripe price (history kept).',
  })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(10_000_000)
  amountCents?: number;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    minimum: 100,
    maximum: 10_000_000,
    description:
      'Owner 2026-10-07: the strikethrough old price in cents; null clears it, absent keeps it.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(100)
  @Max(10_000_000)
  compareAtCents?: number | null;

  @ApiPropertyOptional({
    description:
      'Show the discount (only while the old price is above the price).',
  })
  @IsOptional()
  @IsBoolean()
  showDiscount?: boolean;

  @ApiPropertyOptional({ enum: ['draft', 'active', 'archived'] })
  @IsOptional()
  @IsIn(['draft', 'active', 'archived'])
  status?: 'draft' | 'active' | 'archived';

  @ApiPropertyOptional({ type: 'integer', minimum: 0, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  sort?: number;

  @ApiPropertyOptional({
    description: 'The plan legacy flows buy for this audience + interval.',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  note?: string;

  @ApiPropertyOptional({
    description:
      'Default true. Push changed entitlements/highlights to current subscribers at once (default). ' +
      'false keeps their frozen terms until "apply to subscribers". Prices never move here.',
  })
  @IsOptional()
  @IsBoolean()
  applyNow?: boolean;
}

export class CreatePlanDto extends PlanFieldsDto {
  @ApiProperty({ pattern: '^[a-z][a-z0-9_-]{1,63}$', maxLength: 64 })
  @Transform(trim)
  @IsString()
  @Matches(/^[a-z][a-z0-9_-]{1,63}$/)
  code!: string;

  @ApiProperty({ enum: AUDIENCES })
  @IsIn(AUDIENCES)
  audience!: Audience;

  @ApiProperty({ enum: ['month', 'year'] })
  @IsIn(['month', 'year'])
  interval!: 'month' | 'year';

  @ApiProperty({ type: 'integer', minimum: 100, maximum: 10_000_000 })
  @IsInt()
  @Min(100)
  @Max(10_000_000)
  declare amountCents: number;
}

export class PlanIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  @Matches(/^[0-9a-f-]{36}$/i)
  id!: string;
}

export class ApplyPlanDto {
  @ApiProperty({ minLength: 10, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(300)
  reason!: string;
}

export class AdminPlanDto extends PublicPlanDto {
  @ApiProperty({ enum: ['draft', 'active', 'archived'] }) status!: string;
  @ApiProperty({ type: 'integer' }) sort!: number;
  @ApiProperty({
    type: 'integer',
    description:
      'Live subscribers on this plan (pre-plan rows count for the default plan).',
  })
  subscribers!: number;
  @ApiProperty({ type: String, nullable: true }) stripePriceId!: string | null;
  @ApiProperty({ type: String, nullable: true }) priceKind!: string | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Old price as entered (shown only with showDiscount).',
  })
  compareAtCents!: number | null;
  @ApiProperty() showDiscount!: boolean;
}

export class AdminPlansDto {
  @ApiProperty({ example: 'usd' }) currency!: string;
  @ApiProperty({ enum: ['test', 'live', 'fake'] }) mode!: string;
  @ApiProperty({ type: [AdminPlanDto] }) plans!: AdminPlanDto[];
  @ApiProperty({ type: [EntitlementDefDto] }) catalog!: EntitlementDefDto[];
  @ApiProperty({
    type: [LocalizedTextDto],
    description: 'unused placeholder for schema reuse',
  })
  _localized!: LocalizedTextDto[];
}

export class AdminPlanResultDto extends AdminPlansDto {
  @ApiProperty({ type: String, nullable: true })
  stripeError!: string | null;
}

export class ApplyPlanResultDto {
  @ApiProperty({ type: 'integer' }) updated!: number;
}
