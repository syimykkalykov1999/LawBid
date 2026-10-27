import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { REVIEW_KINDS } from './stripe-ops.helpers';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class StripeReviewQueryDto {
  @ApiPropertyOptional({ enum: ['open', 'resolved', 'dismissed'] })
  @IsOptional()
  @IsIn(['open', 'resolved', 'dismissed'])
  status?: 'open' | 'resolved' | 'dismissed';

  @ApiPropertyOptional({ enum: REVIEW_KINDS, enumName: 'StripeReviewKind' })
  @IsOptional()
  @IsIn(REVIEW_KINDS)
  kind?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  cursor?: string;
}

export class StripeReviewIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class StripeDisputePaymentParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  paymentId!: string;
}

export class StripeReviewResolveDto {
  @ApiProperty({ minLength: 3, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  resolution!: string;
}

export class StripeReviewItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: REVIEW_KINDS, enumName: 'StripeReviewKind' })
  kind!: string;
  @ApiProperty({ enum: ['open', 'resolved', 'dismissed'] }) status!: string;
  @ApiProperty() stripeRef!: string;
  @ApiProperty({ format: 'uuid', nullable: true }) casePaymentId!:
    string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) userId!: string | null;
  @ApiProperty({ type: 'integer', nullable: true }) amountCents!: number | null;
  @ApiProperty() currency!: string;
  @ApiProperty() summary!: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  details!: unknown;
  @ApiProperty({ format: 'date-time' }) openedAt!: Date;
  @ApiProperty({
    format: 'date-time',
    nullable: true,
    description: "Stripe's evidence deadline, or the SLA clock.",
  })
  dueAt!: Date | null;
  @ApiProperty({ enum: ['ok', 'due_soon', 'overdue'] }) sla!: string;
  @ApiProperty({ format: 'date-time', nullable: true })
  resolvedAt!: Date | null;
  @ApiProperty({ nullable: true }) resolution!: string | null;
}

export class StripeReviewSummaryDto {
  @ApiProperty({ type: 'integer' }) open!: number;
  @ApiProperty({ type: 'integer' }) overdue!: number;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'integer' } })
  byKind!: Record<string, number>;
  @ApiProperty({ type: 'integer' }) disputes30d!: number;
  @ApiProperty({ type: 'integer' }) payments30d!: number;
  @ApiProperty({ description: 'Percent, two decimals.' })
  disputeRatePercent!: number;
  @ApiProperty({ enum: ['ok', 'warn', 'alarm'] }) disputeRateLevel!: string;
}

export class StripeDisputeEvidenceDto {
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  fields!: Record<string, string>;
  @ApiProperty({ enum: ['none', 'draft', 'submitted', 'failed'] })
  evidenceStatus!: string;
  @ApiProperty({ format: 'date-time', nullable: true }) dueBy!: Date | null;
}

export class StripeDisputeSubmitResultDto {
  @ApiProperty() status!: string;
  @ApiProperty({ type: 'integer' }) submissionCount!: number;
}
