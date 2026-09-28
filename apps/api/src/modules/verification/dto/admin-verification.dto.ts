import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CheckResult,
  LicenseStatus,
  ScanStatus,
  VerificationCheckType,
  VerificationDocType,
  VerificationProvider,
  VerificationRequestStatus,
  VerificationStatus,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  REJECTION_CODES,
  SUSPEND_REASON_MAX,
  VERIFIER_TEXT_MAX,
  type RejectionCode,
} from '../verification.constants';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export const QUEUE_PAGE_DEFAULT = 20;
export const QUEUE_PAGE_MAX = 50;
export const QUEUE_STATUSES = [
  'submitted',
  'needs_more_info',
  'in_review',
] as const satisfies readonly VerificationRequestStatus[];

// ---- requests -----------------------------------------------------------

export class AdminRequestIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class AdminRequestLicenseParamDto extends AdminRequestIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  licenseId!: string;
}

export class AdminDocumentIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  documentId!: string;
}

export class AdminLicenseIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  licenseId!: string;
}

export class AdminAttorneyIdParamDto {
  @ApiProperty({ format: 'uuid', description: 'Attorney user id.' })
  @IsUUID('all')
  attorneyId!: string;
}

/** Verifier queue (§2.5.1): oldest first, optional status/state filter. */
export class VerificationQueueQueryDto {
  @ApiPropertyOptional({
    enum: QUEUE_STATUSES,
    description: 'Default: submitted and needs_more_info.',
  })
  @IsOptional()
  @IsIn(QUEUE_STATUSES)
  status?: (typeof QUEUE_STATUSES)[number];

  @ApiPropertyOptional({
    example: 'NY',
    description: 'Only requests with a license under review in this state.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Length(2, 2)
  stateCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: QUEUE_PAGE_MAX,
    default: QUEUE_PAGE_DEFAULT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(QUEUE_PAGE_MAX)
  limit?: number;
}

/** Per-license decision (§2.3, §2.5.3). */
export class LicenseDecisionDto {
  @ApiProperty({ enum: ['verified', 'rejected'] })
  @IsIn(['verified', 'rejected'])
  decision!: 'verified' | 'rejected';

  @ApiPropertyOptional({
    enum: REJECTION_CODES,
    description: 'Required when decision = rejected.',
  })
  @ValidateIf((o: LicenseDecisionDto) => o.decision === 'rejected')
  @IsIn(REJECTION_CODES)
  rejectionCode?: RejectionCode;

  @ApiPropertyOptional({ type: String, maxLength: VERIFIER_TEXT_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(VERIFIER_TEXT_MAX)
  note?: string;
}

export class RequestInfoDto {
  @ApiProperty({ type: String, maxLength: VERIFIER_TEXT_MAX })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(VERIFIER_TEXT_MAX)
  message!: string;
}

export class RejectRequestDto {
  @ApiProperty({ enum: REJECTION_CODES })
  @IsIn(REJECTION_CODES)
  rejectionCode!: RejectionCode;

  @ApiPropertyOptional({ type: String, maxLength: VERIFIER_TEXT_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(VERIFIER_TEXT_MAX)
  comment?: string;
}

export class SuspendAttorneyDto {
  @ApiProperty({ type: String, maxLength: SUSPEND_REASON_MAX })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(SUSPEND_REASON_MAX)
  reason!: string;
}

// ---- responses ----------------------------------------------------------

export class AdminAttorneySummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;

  @ApiProperty()
  username!: string;

  @ApiProperty({ enum: VerificationStatus, enumName: 'VerificationStatus' })
  verificationStatus!: VerificationStatus;
}

export class VerificationQueueItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    enum: VerificationRequestStatus,
    enumName: 'VerificationRequestStatus',
  })
  status!: VerificationRequestStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  submittedAt!: string | null;

  @ApiProperty({ type: AdminAttorneySummaryDto })
  attorney!: AdminAttorneySummaryDto;

  @ApiProperty({
    type: String,
    isArray: true,
    description: 'States of the licenses under review.',
  })
  stateCodes!: string[];

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  reviewerId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'System note (name re-check, license re-check).',
  })
  adminNote!: string | null;
}

export interface VerificationQueuePage {
  items: VerificationQueueItemDto[];
  nextCursor: string | null;
}

export class AdminLicenseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'NY' })
  stateCode!: string;

  @ApiProperty({ example: 'New York' })
  stateName!: string;

  @ApiProperty()
  barNumber!: string;

  @ApiProperty({ enum: LicenseStatus, enumName: 'LicenseStatus' })
  status!: LicenseStatus;

  @ApiProperty({ type: String, format: 'date', nullable: true })
  expiresAt!: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Latest automatic bar lookup (§2.4), null if none ran.',
  })
  autoCheckResult!: Record<string, unknown> | null;

  @ApiProperty({ type: String, nullable: true })
  rejectionCode!: string | null;

  @ApiProperty({ type: String, nullable: true })
  rejectionNote!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  verifiedAt!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  decidedBy!: string | null;
}

export class AdminDocumentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: VerificationDocType, enumName: 'VerificationDocType' })
  docType!: VerificationDocType;

  @ApiProperty({ type: String, nullable: true, enum: ['front', 'back'] })
  side!: 'front' | 'back' | null;

  @ApiProperty({ type: String, nullable: true })
  stateCode!: string | null;

  @ApiProperty()
  mime!: string;

  @ApiProperty({ type: 'integer' })
  sizeBytes!: number;

  @ApiProperty({ enum: ScanStatus, enumName: 'ScanStatus' })
  scanStatus!: ScanStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class AdminCheckDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    enum: VerificationCheckType,
    enumName: 'VerificationCheckType',
  })
  checkType!: VerificationCheckType;

  @ApiProperty({
    enum: VerificationProvider,
    enumName: 'VerificationProvider',
  })
  provider!: VerificationProvider;

  @ApiProperty({ enum: CheckResult, enumName: 'CheckResult' })
  result!: CheckResult;

  @ApiProperty({ type: 'object', additionalProperties: true })
  details!: Record<string, unknown>;

  @ApiProperty({ format: 'date-time' })
  checkedAt!: string;
}

export class AdminRequestHistoryItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    enum: VerificationRequestStatus,
    enumName: 'VerificationRequestStatus',
  })
  status!: VerificationRequestStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  submittedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  reviewedAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  rejectionCode!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

/** Request card (§2.5.2). Documents are metadata only: every view of a
 * file goes through the audited signed-URL endpoint. */
export class AdminVerificationRequestDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    enum: VerificationRequestStatus,
    enumName: 'VerificationRequestStatus',
  })
  status!: VerificationRequestStatus;

  @ApiProperty({
    enum: VerificationProvider,
    enumName: 'VerificationProvider',
  })
  provider!: VerificationProvider;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  submittedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  reviewedAt!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  reviewerId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  applicantComment!: string | null;

  @ApiProperty({ type: String, nullable: true })
  infoRequestMessage!: string | null;

  @ApiProperty({ type: String, nullable: true })
  rejectionCode!: string | null;

  @ApiProperty({ type: String, nullable: true })
  rejectionReason!: string | null;

  @ApiProperty({ type: String, nullable: true })
  adminNote!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: AdminAttorneySummaryDto })
  attorney!: AdminAttorneySummaryDto;

  @ApiProperty({ type: AdminLicenseDto, isArray: true })
  licenses!: AdminLicenseDto[];

  @ApiProperty({ type: AdminDocumentDto, isArray: true })
  documents!: AdminDocumentDto[];

  @ApiProperty({ type: AdminCheckDto, isArray: true })
  checks!: AdminCheckDto[];

  @ApiProperty({
    type: AdminRequestHistoryItemDto,
    isArray: true,
    description: "The attorney's other requests, newest first.",
  })
  history!: AdminRequestHistoryItemDto[];
}

export class DocumentUrlDto {
  @ApiProperty({ description: 'Short-lived signed link.' })
  url!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
}

export class LicenseRecheckDto {
  @ApiProperty({ type: AdminLicenseDto })
  license!: AdminLicenseDto;

  @ApiProperty({ enum: CheckResult, enumName: 'CheckResult' })
  result!: CheckResult;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'The request the license was queued in for manual review, null when the lookup passed.',
  })
  requestId!: string | null;
}

export class AttorneyVerificationStatusDto {
  @ApiProperty({ format: 'uuid' })
  attorneyId!: string;

  @ApiProperty({ enum: VerificationStatus, enumName: 'VerificationStatus' })
  verificationStatus!: VerificationStatus;

  @ApiProperty({
    type: 'integer',
    description: 'Active bids moved to withdrawn (suspend).',
  })
  withdrawnBids!: number;
}
