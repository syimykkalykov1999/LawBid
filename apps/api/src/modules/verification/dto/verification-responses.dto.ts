import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  LicenseStatus,
  VerificationDocType,
  VerificationRequestStatus,
  VerificationStatus,
} from '../../../generated/prisma/client';
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

  @ApiProperty({
    description:
      'Owner 2026-10-18: sent for manual review by the attorney (the number ' +
      "does not fit the state's format); a bar card photo is required.",
  })
  manualReview!: boolean;
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

  @ApiProperty({
    required: false,
    description:
      'Owner 2026-11-08: the identity check of this request was started in ' +
      "Persona's hosted flow (it then replaces the ID + selfie uploads).",
  })
  identityCheckStarted!: boolean;
}

/** Who checks the ID + selfie of a new request (owner 2026-11-08). */
export const IDENTITY_PROVIDERS = ['manual', 'persona'] as const;
export type IdentityProviderKind = (typeof IDENTITY_PROVIDERS)[number];

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
      'Identity document and selfie are required: on by default (owner 2026-10-28, setting verification.require_identity); always on for a verified attorney confirming a new name.',
  })
  identityRequired!: boolean;

  @ApiProperty({
    description:
      'A photo of the bar card is required per license (setting verification.require_bar_document, off by default).',
  })
  barDocumentRequired!: boolean;

  @ApiProperty({
    required: false,
    enum: IDENTITY_PROVIDERS,
    enumName: 'IdentityProviderKind',
    description:
      'Owner 2026-11-08: `manual` = upload the ID + selfie for staff (default, ' +
      "as before); `persona` = only while the admin's Persona card has a key, " +
      "template and webhook secret and is switched on: the app opens Persona's " +
      'hosted flow (POST /verification/requests/{id}/identity-check) instead.',
  })
  identityProvider!: IdentityProviderKind;

  @ApiProperty({
    type: 'integer',
    description:
      'Owner 2026-10-18: seconds until a bar number can be added again after ' +
      'too many failed attempts (0 = not locked). The manual-review path ' +
      'stays open while locked.',
  })
  barAttemptsRetryAfterSeconds!: number;

  @ApiProperty({ type: 'integer' })
  submissionsLast30Days!: number;

  @ApiProperty({ type: 'integer' })
  maxSubmissions30Days!: number;
}

/** Owner 2026-11-08: Persona's hosted flow for this request. */
export class IdentityCheckLinkDto {
  @ApiProperty({ description: 'Persona inquiry id (inq_…).' })
  inquiryId!: string;

  @ApiProperty({
    description:
      "Persona's hosted verification page; open it in the in-app browser.",
  })
  url!: string;
}

/** Owner 2026-10-28: a one-time selfie capture token (the app asks for it
 * right before it opens the guided camera). */
export class SelfieCaptureTokenDto {
  @ApiProperty({ description: 'Send back as captureToken with the selfie.' })
  token!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({
    description:
      'verification.selfie_live_capture_required: false = the server also ' +
      'accepts a selfie without the token.',
  })
  required!: boolean;
}

/** R-146: the computer's «continue on your phone» code. */
export class VerificationHandoffDto {
  @ApiProperty({ description: 'One-time code (base64url), valid 10 minutes.' })
  token!: string;

  @ApiProperty({
    description:
      'Short link that opens the selfie step of this request in the app ' +
      '(APP_LINK_BASE_URL/selfie/<token>).',
  })
  url!: string;

  @ApiProperty({ description: 'What the QR code carries (= url).' })
  qrPayload!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
}

export enum VerificationHandoffStatus {
  pending = 'pending',
  done = 'done',
  expired = 'expired',
}

/** R-146: what the computer polls (every 3 s, stops at done / expired). */
export class VerificationHandoffStatusDto {
  @ApiProperty({
    enum: VerificationHandoffStatus,
    enumName: 'VerificationHandoffStatus',
  })
  status!: VerificationHandoffStatus;

  @ApiProperty({ format: 'uuid' })
  requestId!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
}
