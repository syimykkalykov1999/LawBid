import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** $100,000 a month for one service is far above anything here. */
export const TREASURY_EXPENSE_MAX_CENTS = 10_000_000;

export class TreasuryBankDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Chase' }) label!: string;
  @ApiProperty({ example: '6789' }) last4!: string;
  @ApiProperty({ description: "Stripe's default bank for USD payouts." })
  isDefault!: boolean;
}

export class TreasurySetupDto {
  @ApiProperty({ description: 'Stripe keys are saved (or the dev stand-in).' })
  stripeConnected!: boolean;
  @ApiProperty({
    description: 'Stripe payouts are on «Manual», so LawBid decides when.',
  })
  manualPayouts!: boolean;
  @ApiProperty({ type: String, nullable: true, example: 'daily' })
  payoutInterval!: string | null;
  @ApiProperty({ description: 'Stripe listed the banks.' })
  banksListed!: boolean;
  @ApiProperty({ type: 'integer' }) bankCount!: number;
  @ApiProperty({
    description:
      'A second bank (not the default) is in Stripe for «Расходы». Stripe allows one USD bank, so usually false: the expense payout goes to the default bank as its own payout.',
  })
  separateExpenseBank!: boolean;
}

export class TreasuryPlanDto {
  @ApiProperty({ type: 'integer' }) servicesCents!: number;
  @ApiProperty({ type: 'integer' }) expenseAllowanceCents!: number;
  @ApiProperty({ type: 'integer' }) stripeObligationsCents!: number;
  @ApiProperty({ type: 'integer' }) cushionCents!: number;
  @ApiProperty({ type: 'integer' }) reserveTargetCents!: number;
  @ApiProperty({ type: 'integer' }) monthlyCostCents!: number;
  @ApiProperty({ type: 'integer' }) expensePayoutCents!: number;
  @ApiProperty({ type: 'integer' }) profitPayoutCents!: number;
  @ApiProperty({ type: 'integer' }) heldProfitCents!: number;
  @ApiProperty({ type: 'integer' }) shortfallCents!: number;
  @ApiProperty({ type: Number, nullable: true }) coverMonths!: number | null;
}

export class TreasuryExpenseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: 'integer', description: 'What the owner entered.' })
  monthlyCents!: number;
  @ApiProperty({
    type: 'integer',
    description:
      "What the split counts: for AWS the higher of the entry and this month's AWS forecast.",
  })
  effectiveCents!: number;
  @ApiProperty({ enum: ['manual', 'aws'] }) source!: 'manual' | 'aws';
  @ApiProperty() active!: boolean;
  @ApiProperty({ type: 'integer' }) sort!: number;
}

export class TreasuryCostLineDto {
  @ApiProperty({
    enum: ['payroll_stripe', 'payroll_bank', 'owed', 'refund_buffer'],
  })
  key!: 'payroll_stripe' | 'payroll_bank' | 'owed' | 'refund_buffer';
  @ApiProperty({ type: 'integer' }) monthlyCents!: number;
  @ApiProperty({
    enum: ['stripe', 'bank'],
    description: 'Stays on Stripe, or goes to the «Расходы» bank.',
  })
  via!: 'stripe' | 'bank';
}

export class TreasuryPayoutDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '2026-10' }) period!: string;
  @ApiProperty({ enum: ['expenses', 'profit'] }) kind!: string;
  @ApiProperty({ enum: ['auto', 'manual'] }) trigger!: string;
  @ApiProperty({ type: 'integer' }) amountCents!: number;
  @ApiProperty({ type: String, nullable: true })
  destinationLabel!: string | null;
  @ApiProperty({
    enum: ['pending', 'in_transit', 'paid', 'failed', 'canceled'],
  })
  status!: string;
  @ApiProperty({ type: String, nullable: true }) failure!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class TreasurySettingsDto {
  @ApiProperty({ description: 'The split runs by itself every month.' })
  auto!: boolean;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 28 })
  payoutDay!: number;
  @ApiProperty({ type: 'integer', minimum: 0, maximum: 300 })
  bufferPercent!: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) refundBufferUsd!: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) minProfitUsd!: number;
  @ApiProperty({ description: 'Salaries go out by themselves on the pay day.' })
  payrollAuto!: boolean;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 28 })
  payrollDay!: number;
  @ApiProperty({ type: 'integer', minimum: 0, maximum: 20 })
  payrollWarnDays!: number;
}

/** Owner 2026-10-06: the automatic pay day. */
export class TreasuryPayrollDto {
  @ApiProperty({
    description: 'Flag payroll_stripe_payouts on and Stripe keys saved.',
  })
  stripeReady!: boolean;
  @ApiProperty({ format: 'date-time' }) nextPayAt!: string;
  @ApiProperty({ description: "This month's pay day already ran." })
  paidThisPeriod!: boolean;
  @ApiProperty({
    type: 'integer',
    description: 'What the next pay day takes from Stripe, cents.',
  })
  dueCents!: number;
  @ApiProperty({ type: 'integer', description: 'People paid automatically.' })
  people!: number;
  @ApiProperty({
    type: [String],
    description: 'People on a salary not linked to Stripe (paid by hand).',
  })
  notLinked!: string[];
  @ApiProperty({
    type: 'integer',
    description: 'Missing on Stripe for the next pay day, cents (0: enough).',
  })
  shortCents!: number;
}

export class TreasuryOverviewDto {
  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Stripe balance available for payout (null: no Stripe).',
  })
  availableCents!: number | null;
  @ApiProperty({ type: 'integer', nullable: true })
  pendingCents!: number | null;
  @ApiProperty({ type: TreasurySetupDto }) setup!: TreasurySetupDto;
  @ApiProperty({ type: TreasuryBankDto, nullable: true })
  profitBank!: TreasuryBankDto | null;
  @ApiProperty({ type: TreasuryBankDto, nullable: true })
  expenseBank!: TreasuryBankDto | null;
  @ApiProperty({ type: TreasuryPlanDto }) plan!: TreasuryPlanDto;
  @ApiProperty({ type: TreasuryExpenseDto, isArray: true })
  expenses!: TreasuryExpenseDto[];
  @ApiProperty({ type: TreasuryCostLineDto, isArray: true })
  costLines!: TreasuryCostLineDto[];
  @ApiProperty({ type: TreasurySettingsDto }) settings!: TreasurySettingsDto;
  @ApiProperty({ type: TreasuryPayoutDto, isArray: true })
  payouts!: TreasuryPayoutDto[];
  @ApiProperty({ format: 'date-time' }) nextRunAt!: string;
  @ApiProperty({ description: "This month's split already ran." })
  ranThisPeriod!: boolean;
  @ApiProperty({ type: TreasuryPayrollDto }) payroll!: TreasuryPayrollDto;
}

export class TreasuryRunResultDto {
  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['no_stripe', 'not_manual', 'busy'],
    description: 'Why nothing was sent (null: the split ran).',
  })
  skipped!: 'no_stripe' | 'not_manual' | 'busy' | null;
  @ApiProperty({ type: 'integer' }) expensesCents!: number;
  @ApiProperty({ type: 'integer' }) profitCents!: number;
  @ApiProperty({ type: 'integer' }) shortfallCents!: number;
}

export class UpdateTreasurySettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() auto?: boolean;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 28 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  payoutDay?: number;

  @ApiPropertyOptional({ type: 'integer', minimum: 0, maximum: 300 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(300)
  bufferPercent?: number;

  @ApiPropertyOptional({ type: 'integer', minimum: 0, maximum: 100000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  refundBufferUsd?: number;

  @ApiPropertyOptional({ type: 'integer', minimum: 0, maximum: 100000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  minProfitUsd?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() payrollAuto?: boolean;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 28 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  payrollDay?: number;

  @ApiPropertyOptional({ type: 'integer', minimum: 0, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  payrollWarnDays?: number;
}

export class CreateTreasuryExpenseDto {
  @ApiProperty({ maxLength: 80, example: 'Twilio (SMS)' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ type: 'integer', description: 'A month, cents.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(TREASURY_EXPENSE_MAX_CENTS)
  monthlyCents!: number;
}

export class UpdateTreasuryExpenseDto {
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ type: 'integer' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(TREASURY_EXPENSE_MAX_CENTS)
  monthlyCents?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class TreasuryExpenseIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}
