import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  LicenseStatus,
  VerificationDocType,
  VerificationRequestStatus,
  VerificationStatus,
} from '@prisma/client';
import { StateRefDto } from '../../profiles/dto/attorney-profile.dto';

/** The attorney's own license inside a verification request (bar number
 * is shown to its owner only, docs/03 §6.2). */
export class VerificationLicenseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: StateRefDto })
  state!: StateRefDto;

  @ApiProperty()
  barNumber!: string;

  @ApiProperty({ enum: LicenseStatus, enumName: 'LicenseStatus' })
  status!: LicenseStatus;

  @ApiProperty({ type: String, format: 'date', nullable: true })
  expiresAt!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Rejection code (`verification.reject.<code>`).',
  })
  rejectionCode!: string | null;

  @ApiProperty({ type: String, nullable: true })
  rejectionNote!: string | null;
}

/** Metadata of an attached document. No link: after submission the app
 * never shows documents again (§2.2); only verifiers get signed URLs. */
export class OwnVerificationDocumentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: VerificationDocType, enumName: 'VerificationDocType' })
  docType!: VerificationDocType;

  @ApiProperty({ type: String, nullable: true, enum: ['front', 'back'] })
  side!: 'front' | 'back' | null;

  @ApiProperty({ type: String, nullable: true })
  stateCode!: string | null;

  @ApiProperty({ format: 'uuid' })
  fileId!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class VerificationRequestDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    enum: VerificationRequestStatus,
    enumName: 'VerificationRequestStatus',
  })
  status!: VerificationRequestStatus;

  @ApiProperty({ type: String, nullable: true })
  applicantComment!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The verifier message of `needs_more_info`.',
  })
  infoRequestMessage!: string | null;

  @ApiProperty({ type: String, nullable: true })
  rejectionCode!: string | null;

  @ApiProperty({ type: String, nullable: true })
  rejectionReason!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  submittedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  reviewedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({
    type: VerificationLicenseDto,
    isArray: true,
    description: "All of the attorney's licenses with their status.",
  })
  licenses!: VerificationLicenseDto[];

  @ApiProperty({ type: OwnVerificationDocumentDto, isArray: true })
  documents!: OwnVerificationDocumentDto[];
}

/** GET /verification/me — status screen (§8.6). */
export class VerificationOverviewDto {
  @ApiProperty({ enum: VerificationStatus, enumName: 'VerificationStatus' })
  verificationStatus!: VerificationStatus;

  @ApiPropertyOptional({
    type: VerificationRequestDto,
    nullable: true,
    description: 'The latest request, or null if none yet.',
  })
  request!: VerificationRequestDto | null;

  @ApiProperty({
    description:
      'Identity document and selfie are required (false for an already verified attorney adding a state, §2.1).',
  })
  identityRequired!: boolean;

  @ApiProperty({ type: 'integer' })
  submissionsLast30Days!: number;

  @ApiProperty({ type: 'integer' })
  maxSubmissions30Days!: number;
}
