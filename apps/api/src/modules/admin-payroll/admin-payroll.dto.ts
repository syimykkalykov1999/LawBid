import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
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
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** $1,000,000 a month is far above any salary here; a typo guard. */
export const PAYROLL_MAX_CENTS = 100_000_000;

export const PAYOUT_METHODS = [
  'manual',
  'bank',
  'zelle',
  'cash',
  'other',
  'stripe',
] as const;

export const PAYOUT_STATUSES = [
  'paid',
  'canceled',
  'processing',
  'failed',
] as const;

export class PayrollEmployeesQueryDto {
  @ApiPropertyOptional({ description: 'Also show people taken off payroll.' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeInactive?: boolean;
}

export class CreatePayrollEmployeeDto {
  @ApiProperty({ maxLength: 120 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ maxLength: 120, example: 'Moderator' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  roleTitle?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'The admin account of this person, if any.',
  })
  @IsOptional()
  @IsUUID('all')
  adminUserId?: string;

  @ApiProperty({ type: 'integer', description: 'Fixed monthly amount, cents.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAYROLL_MAX_CENTS)
  amountCents!: number;

  @ApiPropertyOptional({ default: 'usd' })
  @IsOptional()
  @Matches(/^[a-z]{3}$/)
  currency?: string;

  @ApiPropertyOptional({
    maxLength: 300,
    description: 'How they are paid (bank, Zelle, cash…).',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  methodNote?: string;

  @ApiPropertyOptional({
    maxLength: 254,
    description: 'For the Stripe invite (bank account / card link).',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() || undefined : value,
  )
  @IsEmail()
  @MaxLength(254)
  email?: string;
}

export class UpdatePayrollEmployeeDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  roleTitle?: string;

  @ApiPropertyOptional({ type: 'integer' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAYROLL_MAX_CENTS)
  amountCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[a-z]{3}$/)
  currency?: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  methodNote?: string;

  @ApiPropertyOptional({
    maxLength: 254,
    description: 'For the Stripe invite (bank account / card link).',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() || undefined : value,
  )
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({
    description: 'Off: taken off payroll (kept in history).',
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class PayrollEmployeeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  adminUserId!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty() roleTitle!: string;
  @ApiProperty({ type: 'integer' }) amountCents!: number;
  @ApiProperty() currency!: string;
  @ApiProperty() methodNote!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ description: 'A Stripe account was created for them.' })
  stripeLinked!: boolean;
  @ApiProperty({
    description: 'Their bank account / card is linked in Stripe.',
  })
  stripePayoutsEnabled!: boolean;
  @ApiProperty() active!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true })
  lastPaidPeriod!: string | null;
  @ApiProperty() createdAt!: string;
}

export class PayrollBulkPayDto {
  @ApiProperty({ type: [String], format: 'uuid', minItems: 1, maxItems: 500 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  employeeIds!: string[];

  @ApiProperty({
    example: '2026-10',
    description: 'Month or any period label.',
  })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  period!: string;

  @ApiPropertyOptional({ enum: PAYOUT_METHODS, default: 'manual' })
  @IsOptional()
  @IsIn(PAYOUT_METHODS)
  method?: (typeof PAYOUT_METHODS)[number];

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'integer' },
    description:
      'employeeId → amount in cents for this run (bonus, part of a month); the others get their fixed amount.',
  })
  @IsOptional()
  @IsObject()
  amounts?: Record<string, number>;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class PayrollPayoutsQueryDto {
  @ApiPropertyOptional({ example: '2026-10' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  period?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  employeeId?: string;
}

export class PayrollCancelDto {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class PayrollPayoutDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) employeeId!: string;
  @ApiProperty() employeeName!: string;
  @ApiProperty({ format: 'uuid' }) batchId!: string;
  @ApiProperty() period!: string;
  @ApiProperty({ type: 'integer' }) amountCents!: number;
  @ApiProperty() currency!: string;
  @ApiProperty({ enum: PAYOUT_METHODS }) method!: string;
  @ApiProperty({ enum: PAYOUT_STATUSES }) status!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  transferId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  failure!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  cancelReason!: string | null;
  @ApiProperty() createdAt!: string;
}

export class PayrollBulkResultDto {
  @ApiProperty({ format: 'uuid' }) batchId!: string;
  @ApiProperty({ type: 'integer' }) count!: number;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'integer' },
    description: 'currency → total cents of this run.',
  })
  totals!: Record<string, number>;
  @ApiProperty({
    type: [String],
    description: 'Employees already paid for this period (skipped).',
  })
  alreadyPaid!: string[];
  @ApiProperty({
    type: [String],
    description: 'Stripe transfers that failed (not paid; retry later).',
  })
  failed!: string[];
}

export class PayrollStripeLinkDto {
  @ApiProperty({
    description:
      'Stripe page where the person links a bank account or debit card (send it to them).',
  })
  url!: string;
  @ApiProperty() payoutsEnabled!: boolean;
}

export class PayrollSummaryQueryDto {
  @ApiProperty({ example: '2026-10' })
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  period!: string;
}

export class PayrollSummaryDto {
  @ApiProperty() period!: string;
  @ApiProperty({ type: 'integer' }) activeEmployees!: number;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'integer' },
    description: 'currency → fixed monthly total of active employees.',
  })
  monthly!: Record<string, number>;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'integer' },
    description: 'currency → paid for this period.',
  })
  paid!: Record<string, number>;
  @ApiProperty({ type: 'integer' }) unpaidEmployees!: number;
  @ApiProperty({
    description:
      'Stripe payouts can be used (flag payroll_stripe_payouts on and Stripe keys saved).',
  })
  stripeAvailable!: boolean;
}
