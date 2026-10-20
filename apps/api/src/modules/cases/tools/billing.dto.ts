import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { tidy } from '../../../common/utils/tidy-text';
import { MAX_ENTRY_MINUTES } from './billing.math';

export const RATE_MAX_CENTS = 10_000_000;
export const EXPENSE_MAX_CENTS = 100_000_000;
export const TIME_NOTE_MAX = 300;
export const EXPENSE_TEXT_MAX = 200;
export const INVOICE_NOTE_MAX = 500;

export class SetRateDto {
  @ApiProperty({
    minimum: 0,
    maximum: RATE_MAX_CENTS,
    description: 'Cents per hour',
  })
  @IsInt()
  @Min(0)
  @Max(RATE_MAX_CENTS)
  hourlyRateCents!: number;
}

export class AddTimeDto {
  @ApiProperty({ format: 'date', example: '2026-10-20' })
  @IsDateString({ strict: true })
  workedOn!: string;

  @ApiProperty({ minimum: 1, maximum: MAX_ENTRY_MINUTES })
  @IsInt()
  @Min(1)
  @Max(MAX_ENTRY_MINUTES)
  minutes!: number;

  @ApiPropertyOptional({ maxLength: TIME_NOTE_MAX })
  @IsOptional()
  @Transform(tidy)
  @IsString()
  @MaxLength(TIME_NOTE_MAX)
  note?: string;
}

export class UpdateTimeDto {
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_ENTRY_MINUTES })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_ENTRY_MINUTES)
  minutes?: number;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true })
  workedOn?: string;

  @ApiPropertyOptional({ maxLength: TIME_NOTE_MAX })
  @IsOptional()
  @Transform(tidy)
  @IsString()
  @MaxLength(TIME_NOTE_MAX)
  note?: string;
}

export class StopTimerDto {
  @ApiPropertyOptional({ maxLength: TIME_NOTE_MAX })
  @IsOptional()
  @Transform(tidy)
  @IsString()
  @MaxLength(TIME_NOTE_MAX)
  note?: string;
}

export class AddExpenseDto {
  @ApiProperty({ format: 'date', example: '2026-10-20' })
  @IsDateString({ strict: true })
  spentOn!: string;

  @ApiProperty({ maxLength: EXPENSE_TEXT_MAX })
  @Transform(tidy)
  @IsString()
  @MinLength(1)
  @MaxLength(EXPENSE_TEXT_MAX)
  description!: string;

  @ApiProperty({ minimum: 1, maximum: EXPENSE_MAX_CENTS })
  @IsInt()
  @Min(1)
  @Max(EXPENSE_MAX_CENTS)
  amountCents!: number;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'A receipt photo / PDF (a clean case_photo or case_attachment).',
  })
  @IsOptional()
  @IsUUID('all')
  receiptFileId?: string;
}

export class IssueInvoiceDto {
  @ApiPropertyOptional({ maxLength: INVOICE_NOTE_MAX })
  @IsOptional()
  @Transform(tidy)
  @IsString()
  @MaxLength(INVOICE_NOTE_MAX)
  note?: string;
}

export class EntryIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  entryId!: string;
}

export class InvoiceIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  invoiceId!: string;
}

export class TimeEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ format: 'date' }) workedOn!: string;
  @ApiProperty({
    description: 'Minutes counted (a running timer: before this run).',
  })
  minutes!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  runningSince!: string | null;
  @ApiProperty() note!: string;
  @ApiProperty() rateCents!: number;
  @ApiProperty({ description: 'Price of the counted minutes.' }) cents!: number;
  @ApiProperty({ type: String, nullable: true }) invoiceId!: string | null;
}

export class ExpenseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ format: 'date' }) spentOn!: string;
  @ApiProperty() description!: string;
  @ApiProperty() amountCents!: number;
  @ApiProperty({ type: String, nullable: true }) receiptUrl!: string | null;
  @ApiProperty({ type: String, nullable: true }) receiptPreviewUrl!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) invoiceId!: string | null;
}

export class InvoiceLineDto {
  @ApiProperty({ enum: ['time', 'expense'] }) kind!: 'time' | 'expense';
  @ApiProperty({ format: 'date' }) date!: string;
  @ApiProperty() text!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) minutes!:
    number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) rateCents!:
    number | null;
  @ApiProperty() cents!: number;
}

export class InvoiceDto {
  @ApiProperty() id!: string;
  @ApiProperty() number!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty() currency!: string;
  @ApiProperty() minutes!: number;
  @ApiProperty() timeCents!: number;
  @ApiProperty() expensesCents!: number;
  @ApiProperty() totalCents!: number;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ type: [InvoiceLineDto] }) lines!: InvoiceLineDto[];
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The PDF (a case file).',
  })
  url!: string | null;
  @ApiProperty({ type: String, format: 'uuid' }) fileId!: string;
}

export class RunningTimerDto {
  @ApiProperty() entryId!: string;
  @ApiProperty() caseId!: string;
  @ApiProperty() caseTitle!: string;
  @ApiProperty({ format: 'date-time' }) startedAt!: string;
}

export class BillingTotalsDto {
  @ApiProperty() minutes!: number;
  @ApiProperty() timeCents!: number;
  @ApiProperty() expensesCents!: number;
  @ApiProperty() totalCents!: number;
}

export class CaseBillingDto {
  @ApiProperty({ enum: ['client', 'attorney'] }) role!: 'client' | 'attorney';
  @ApiProperty({ description: 'Attorney side that may add and issue.' })
  canEdit!: boolean;
  @ApiProperty() currency!: string;
  @ApiProperty({ type: Number, nullable: true }) hourlyRateCents!:
    number | null;
  @ApiProperty({ type: RunningTimerDto, nullable: true })
  timer!: RunningTimerDto | null;
  @ApiProperty({ type: [TimeEntryDto], description: 'Attorney only.' })
  entries!: TimeEntryDto[];
  @ApiProperty({ type: [ExpenseDto], description: 'Attorney only.' })
  expenses!: ExpenseDto[];
  @ApiProperty({
    type: BillingTotalsDto,
    description: 'Not yet on an invoice.',
  })
  unbilled!: BillingTotalsDto;
  @ApiProperty({ type: [InvoiceDto] }) invoices!: InvoiceDto[];
}
