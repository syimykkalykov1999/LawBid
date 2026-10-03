import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PLAN_KINDS, type PlanKind } from '../billing/pricing.service';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class PlanKindParamDto {
  @ApiProperty({ enum: PLAN_KINDS, enumName: 'PlanKind' })
  @IsIn(PLAN_KINDS)
  kind!: PlanKind;
}

export class SetPlanPriceDto {
  @ApiProperty({
    type: 'integer',
    minimum: 100,
    maximum: 10_000_000,
    description: 'New price in cents ($1 … $100,000).',
  })
  @IsInt()
  @Min(100)
  @Max(10_000_000)
  amountCents!: number;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class MovePlanSubscribersDto {
  @ApiProperty({ minLength: 10, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(300)
  reason!: string;
}

export class AdminPlanPriceItemDto {
  @ApiProperty({ enum: PLAN_KINDS, enumName: 'PlanKind' }) kind!: PlanKind;
  @ApiProperty({ type: 'integer' }) amountCents!: number;
  @ApiProperty({ type: 'integer', description: 'Built-in default.' })
  defaultCents!: number;
  @ApiProperty({ description: 'false = the built-in default is used.' })
  isCustom!: boolean;
  @ApiProperty({ enum: ['month', 'year'] }) interval!: 'month' | 'year';
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Stripe price of this amount for the current keys.',
  })
  stripePriceId!: string | null;
  @ApiProperty({
    type: 'integer',
    description: 'Paying subscribers on this plan (any price).',
  })
  subscribers!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  updatedAt!: string | null;
}

export class AdminPlanPriceHistoryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: PLAN_KINDS, enumName: 'PlanKind' }) kind!: PlanKind;
  @ApiProperty({ type: 'integer' }) amountCents!: number;
  @ApiProperty() active!: boolean;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ type: String, nullable: true }) createdBy!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AdminPlanPricesDto {
  @ApiProperty({ example: 'usd' }) currency!: string;
  @ApiProperty({ enum: ['test', 'live', 'fake'] }) mode!: string;
  @ApiProperty({ type: [AdminPlanPriceItemDto] })
  items!: AdminPlanPriceItemDto[];
  @ApiProperty({ type: [AdminPlanPriceHistoryDto] })
  history!: AdminPlanPriceHistoryDto[];
}

export class AdminSetPlanPriceResultDto extends AdminPlanPricesDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Set when the Stripe price could not be created now (it is retried at the next checkout).',
  })
  stripeError!: string | null;
}

export class MovePlanSubscribersResultDto {
  @ApiProperty({ type: 'integer' }) moved!: number;
  @ApiProperty({ type: 'integer', description: 'Already on the price.' })
  skipped!: number;
  @ApiProperty({ type: 'integer' }) failed!: number;
}
