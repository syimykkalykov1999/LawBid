import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Owner 2026-10-22 (maker-checker): «Требуют подтверждения». */

export class AdminApprovalIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class AdminApprovalsQueryDto {
  @ApiPropertyOptional({
    enum: ['pending', 'done'],
    default: 'pending',
    description: 'pending = waiting for a second admin; done = decided.',
  })
  @IsOptional()
  @IsIn(['pending', 'done'])
  status?: 'pending' | 'done';
}

export class AdminApprovalRejectDto {
  @ApiPropertyOptional({ maxLength: 500, description: 'Why (optional).' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AdminApprovalPersonDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
}

export class AdminApprovalDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({
    enum: [
      'payroll_bulk_payout',
      'billing_refund',
      'payroll_bonus',
      'partner_payout',
      'partner_commission_paid',
      'ops_db_replica',
      'ops_partition_start',
      'ops_partition_undo',
      'ops_partition_finalize',
    ],
  })
  kind!: string;
  @ApiProperty({ description: 'Russian label of the kind.' }) label!: string;
  @ApiProperty() summary!: string;
  @ApiProperty({
    type: 'integer',
    description: 'Compared with the limit (cents).',
  })
  amountCents!: number;
  @ApiProperty({
    enum: ['pending', 'approved', 'rejected', 'failed', 'expired'],
  })
  status!: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'The request body the action runs with.',
  })
  payload!: unknown;
  @ApiProperty({ type: AdminApprovalPersonDto })
  requestedBy!: AdminApprovalPersonDto;
  @ApiProperty({ type: AdminApprovalPersonDto, nullable: true })
  approvedBy!: AdminApprovalPersonDto | null;
  @ApiProperty({ type: AdminApprovalPersonDto, nullable: true })
  rejectedBy!: AdminApprovalPersonDto | null;
  @ApiProperty({ type: String, nullable: true }) decisionNote!: string | null;
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  decidedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  executedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty({ description: 'The viewer may approve or reject it now.' })
  canDecide!: boolean;
  @ApiProperty({ description: 'The viewer asked for it.' }) mine!: boolean;
}

export class AdminApprovalsCountDto {
  @ApiProperty({
    type: 'integer',
    description: 'Requests this admin could approve now.',
  })
  pending!: number;
  @ApiProperty({
    type: 'integer',
    description: 'billing.dual_approval_min_cents: from this amount on.',
  })
  limitCents!: number;
}
