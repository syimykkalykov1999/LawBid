import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

// --- «Запуск» ---------------------------------------------------------------

export class LaunchItemDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    enum: ['release', 'servers', 'calls', 'media', 'alerts', 'money', 'safety'],
  })
  group!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: ['green', 'yellow', 'red', 'manual'] }) status!: string;
  @ApiProperty() detail!: string;
  @ApiProperty({ type: String, nullable: true }) hint!: string | null;
  @ApiProperty({ type: String, nullable: true }) runbook!: string | null;
  @ApiProperty({ description: 'The owner may tick it by hand.' })
  manualTick!: boolean;
  @ApiProperty() ticked!: boolean;
  @ApiProperty({ enum: ['restore_drill'], nullable: true })
  action!: 'restore_drill' | null;
}

export class LaunchReportDto {
  @ApiProperty() generatedAt!: string;
  @ApiProperty({ type: [LaunchItemDto] }) items!: LaunchItemDto[];
  @ApiProperty() greenCount!: number;
  @ApiProperty() total!: number;
}

export class LaunchTickParamDto {
  @ApiProperty()
  @Matches(/^[a-z0-9_]{2,40}$/)
  id!: string;
}

export class LaunchTickDto {
  @ApiProperty() @IsBoolean() done!: boolean;
}

export class RestoreDrillDto {
  @ApiPropertyOptional({
    description: 'Free note, e.g. the RTO the script printed.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class PagingStatusDto {
  @ApiProperty() available!: boolean;
  @ApiProperty() configured!: boolean;
  @ApiProperty({ type: String, nullable: true }) endpointMasked!: string | null;
  @ApiProperty({ enum: ['none', 'pending', 'confirmed'] }) state!: string;
  @ApiProperty() stale!: boolean;
  @ApiProperty() checkedAt!: string;
}

// --- AWS Budgets --------------------------------------------------------------

export class AwsBudgetDto {
  @ApiProperty() name!: string;
  @ApiProperty({ type: Number, nullable: true }) limitUsd!: number | null;
  @ApiProperty({ type: Number, nullable: true }) actualUsd!: number | null;
  @ApiProperty({ type: Number, nullable: true }) forecastUsd!: number | null;
  @ApiProperty({ type: String, nullable: true }) timeUnit!: string | null;
  @ApiProperty() prod!: boolean;
  @ApiProperty() obsolete!: boolean;
}

export class AwsBudgetsDto {
  @ApiProperty() available!: boolean;
  @ApiProperty({ type: [AwsBudgetDto] }) items!: AwsBudgetDto[];
}

export class BudgetLimitRequestDto {
  @ApiProperty() @IsString() @MaxLength(100) name!: string;
  @ApiProperty({ description: 'New monthly limit, USD.' })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100000)
  limitUsd!: number;
}

export class BudgetDeleteRequestDto {
  @ApiProperty() @IsString() @MaxLength(100) name!: string;
}

// --- «Расходы» ----------------------------------------------------------------

export class DayUsdDto {
  @ApiProperty() date!: string;
  @ApiProperty() usd!: number;
}

export class VendorSpendLineDto {
  @ApiProperty() label!: string;
  @ApiProperty() usd!: number;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
}

export class FreeTierDto {
  @ApiProperty() label!: string;
  @ApiProperty() used!: number;
  @ApiProperty() free!: number;
  @ApiProperty() unit!: string;
}

export class VendorSpendDto {
  @ApiProperty({ enum: ['aws', 'twilio', 'bunny', 'cloudflare', 'stripe'] })
  id!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ enum: ['ok', 'stale', 'nodata'] }) status!: string;
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
  @ApiProperty({ type: String, nullable: true }) updatedAt!: string | null;
  @ApiProperty({ type: Number, nullable: true }) monthToDateUsd!: number | null;
  @ApiProperty({ type: Number, nullable: true }) lastMonthUsd!: number | null;
  @ApiProperty({ type: Number, nullable: true }) forecastUsd!: number | null;
  @ApiProperty({ type: Number, nullable: true })
  coveredByCreditsUsd!: number | null;
  @ApiProperty({ type: Number, nullable: true }) balanceUsd!: number | null;
  @ApiProperty({ type: [DayUsdDto] }) daily!: DayUsdDto[];
  @ApiProperty({ type: [VendorSpendLineDto] }) lines!: VendorSpendLineDto[];
  @ApiProperty({ type: FreeTierDto, nullable: true })
  freeTier!: FreeTierDto | null;
  @ApiProperty({ type: [String] }) notes!: string[];
}

export class FixedCostDto {
  @ApiProperty() @IsString() @Matches(/^[a-z0-9_-]{1,40}$/) id!: string;
  @ApiProperty() @IsString() @MaxLength(80) label!: string;
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  usd!: number;
  @ApiProperty({ enum: ['month', 'year', 'once'] })
  @IsIn(['month', 'year', 'once'])
  period!: 'month' | 'year' | 'once';
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'YYYY-MM, for «once».',
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  paidMonth?: string | null;
}

export class FixedCostViewDto extends FixedCostDto {
  @ApiProperty({ description: 'What it adds to this month.' })
  monthlyUsd!: number;
}

export class PriceDto {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiProperty() unit!: string;
  @ApiProperty() value!: number;
  @ApiProperty() defaultValue!: number;
  @ApiProperty() edited!: boolean;
  @ApiProperty() sourceUrl!: string;
  @ApiProperty() checkedAt!: string;
}

export class SpendTotalDto {
  @ApiProperty() monthToDateUsd!: number;
  @ApiProperty() forecastUsd!: number;
  @ApiProperty() marginPercent!: number;
  @ApiProperty() keepOnAccountUsd!: number;
  @ApiProperty() fixedMonthUsd!: number;
  @ApiProperty({ type: Number, nullable: true }) stripeFeesUsd!: number | null;
}

export class SpendReportDto {
  @ApiProperty() generatedAt!: string;
  @ApiProperty({ type: String, nullable: true }) refreshedAt!: string | null;
  @ApiProperty({ type: [VendorSpendDto] }) vendors!: VendorSpendDto[];
  @ApiProperty({ type: [FixedCostViewDto] }) fixed!: FixedCostViewDto[];
  @ApiProperty({ type: [PriceDto] }) prices!: PriceDto[];
  @ApiProperty({ type: SpendTotalDto }) total!: SpendTotalDto;
}

export class UpdateFixedCostsDto {
  @ApiProperty({ type: [FixedCostDto] })
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => FixedCostDto)
  items!: FixedCostDto[];
}

export class UpdatePricesDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    description: 'Price key → new value (only known keys are saved).',
  })
  @IsObject()
  values!: Record<string, number>;
}
