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

// --- cost registry (owner 2026-10-25) --------------------------------------

export class CostRegistryRowDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() purpose!: string;
  @ApiProperty({ enum: ['aws', 'vendor', 'sdk', 'ci'] }) kind!:
    'aws' | 'vendor' | 'sdk' | 'ci';
  @ApiProperty({ enum: ['app-setting', 'ssm-mode', 'tfvars', 'fixed'] })
  controlType!: 'app-setting' | 'ssm-mode' | 'tfvars' | 'fixed';
  @ApiProperty({
    description:
      'Setting key, SSM switch, Terraform variables, or the reason it is fixed.',
  })
  controlKey!: string;
  @ApiProperty({ description: 'The owner can flip it from this page.' })
  editable!: boolean;
  @ApiProperty({ type: String, nullable: true }) lockedReason!: string | null;
  @ApiProperty({ type: [String], enum: ['off', 'on', 'auto'] })
  states!: ('off' | 'on' | 'auto')[];
  @ApiProperty({ enum: ['off', 'on', 'auto'] }) defaultState!:
    'off' | 'on' | 'auto';
  @ApiProperty({ enum: ['off', 'on', 'auto'], nullable: true })
  state!: 'off' | 'on' | 'auto' | null;
  @ApiProperty({
    description: 'false: the state is the code default or unreadable.',
  })
  stateKnown!: boolean;
  @ApiProperty({ type: String, nullable: true }) stateNote!: string | null;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'state → what that position means, where it is not obvious.',
  })
  stateHints!: Record<string, string>;
  @ApiProperty({ type: String, nullable: true }) ceilingLabel!: string | null;
  @ApiProperty({ type: String, nullable: true }) ceilingKey!: string | null;
  @ApiProperty({ type: String, nullable: true }) ceilingWhere!: string | null;
  @ApiProperty() priceText!: string;
  @ApiProperty() priceModel!: string;
  @ApiProperty() priceSourceUrl!: string;
  @ApiProperty() priceCheckedAt!: string;
  @ApiProperty() priceVerified!: boolean;
  @ApiProperty({ type: [Number], description: '[min, max] $/month at launch.' })
  usdLaunch!: number[];
  @ApiProperty({ type: [Number] }) usdK100!: number[];
  @ApiProperty({ type: [Number] }) usdM1!: number[];
  @ApiProperty({ type: [Number], nullable: true }) ifOnUsd!: number[] | null;
  @ApiProperty({ enum: ['yes', 'auto', 'later', 'no'] }) needed!:
    'yes' | 'auto' | 'later' | 'no';
  @ApiProperty() neededNote!: string;
  @ApiProperty({ type: String, nullable: true }) alarm!: string | null;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'AWS Cost Explorer service name whose bill belongs to the row.',
  })
  ceService!: string | null;
  @ApiProperty({ type: Number, nullable: true }) monthUsd!: number | null;
  @ApiProperty({ type: Number, nullable: true }) projectedUsd!: number | null;
  @ApiProperty({ enum: ['real', 'split', 'none'] }) monthSource!:
    'real' | 'split' | 'none';
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'array', items: { type: 'string' } },
    description: 'state → plain-Russian steps to put the item in that state.',
  })
  steps!: Record<string, string[]>;
}

export class CostRegistryUnclaimedDto {
  @ApiProperty() service!: string;
  @ApiProperty() usd!: number;
}

export class CostLadderScenarioDto {
  @ApiProperty() users!: number;
  @ApiProperty({ type: [Number] }) usd!: number[];
}

export class CostLadderDayOneDto {
  @ApiProperty({ type: [Number] }) aws!: number[];
  @ApiProperty({ type: [Number] }) vendors!: number[];
  @ApiProperty({ type: [Number] }) all!: number[];
}

export class CostLadderDto {
  @ApiProperty({ type: CostLadderDayOneDto }) dayOne!: CostLadderDayOneDto;
  @ApiProperty({ type: [CostLadderScenarioDto] })
  scenarios!: CostLadderScenarioDto[];
  @ApiProperty({ type: Number, nullable: true }) monthToDateUsd!: number | null;
  @ApiProperty({ type: Number, nullable: true }) projectedUsd!: number | null;
}

export class CostRegistryReportDto {
  @ApiProperty() generatedAt!: string;
  @ApiProperty({ type: String, nullable: true }) spendRefreshedAt!:
    string | null;
  @ApiProperty({ type: [CostRegistryRowDto] }) rows!: CostRegistryRowDto[];
  @ApiProperty({ type: [CostRegistryUnclaimedDto] })
  unclaimed!: CostRegistryUnclaimedDto[];
  @ApiProperty({ type: CostLadderDto }) ladder!: CostLadderDto;
}

export class SetCostModeDto {
  @ApiProperty({ enum: ['off', 'on', 'auto'] })
  @IsIn(['off', 'on', 'auto'])
  state!: 'off' | 'on' | 'auto';
}

export class CostModeResultDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['off', 'on', 'auto'] }) state!: 'off' | 'on' | 'auto';
}
