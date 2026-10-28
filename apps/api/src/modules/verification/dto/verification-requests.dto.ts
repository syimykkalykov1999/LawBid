import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VerificationDocType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { APPLICANT_COMMENT_MAX } from '../verification.constants';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const upperTrim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

/** Bar numbers: letters, digits and `-`, `.`, `/`, space inside;
 * normalized to upper case so "ab123" and "AB123" are one license. */
export const BAR_NUMBER_PATTERN = /^[A-Z0-9][A-Z0-9 ./-]{0,31}$/;

export class RequestIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class RequestLicenseParamDto extends RequestIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  licenseId!: string;
}

export class RequestDocumentParamDto extends RequestIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  documentId!: string;
}

/** PATCH /verification/requests/:id — the "Комментарий для
 * проверяющего" (§2.1, ≤500). Empty string clears it. */
export class UpdateVerificationRequestDto {
  @ApiProperty({ type: String, maxLength: APPLICANT_COMMENT_MAX })
  @Transform(trim)
  @IsString()
  @MaxLength(APPLICANT_COMMENT_MAX)
  applicantComment!: string;
}

export class SubmitVerificationRequestDto {
  @ApiPropertyOptional({
    description:
      'Owner 2026-10-04: the attorney confirms under penalty of perjury that they hold the entered licenses (sworn statement, version ATTESTATION_VERSION). Required for a new submission.',
  })
  @IsOptional()
  @IsBoolean()
  attestation?: boolean;

  @ApiPropertyOptional({ type: String, maxLength: APPLICANT_COMMENT_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(APPLICANT_COMMENT_MAX)
  applicantComment?: string;
}

/** POST /verification/requests/:id/licenses (§2.1 "Лицензии"). */
export class AddLicenseDto {
  @ApiProperty({ example: 'NY', description: 'US state code' })
  @Transform(upperTrim)
  @IsString()
  @Length(2, 2)
  stateCode!: string;

  @ApiProperty({ example: '1234567', maxLength: 32 })
  @Transform(upperTrim)
  @IsString()
  @Matches(BAR_NUMBER_PATTERN, { message: 'barNumber has an invalid format' })
  barNumber!: string;

  // A plain date string, not `format: 'date'`: the Dart generator maps that
  // format to DateTime and would send a full ISO timestamp, which this
  // YYYY-MM-DD validator rejects.
  @ApiPropertyOptional({
    type: String,
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    nullable: true,
    example: '2027-06-30',
    description: 'License expiry (YYYY-MM-DD), if the license has one.',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'expiresAt must be YYYY-MM-DD' })
  expiresAt?: string | null;

  @ApiPropertyOptional({
    description:
      'True to renew a license that is still verified (a new expiry date). ' +
      'Without it a state that is already verified is refused.',
  })
  @IsOptional()
  @IsBoolean()
  renewal?: boolean;

  @ApiPropertyOptional({
    description:
      'Owner 2026-10-18 («Мой номер верный — отправить на проверку»): the ' +
      'attorney insists the number is right although it does not fit the ' +
      "state's format. It is added for a person to check (registry flag " +
      'format_unusual) and the bar card photo becomes required; allowed ' +
      'while the attempts lock is on.',
  })
  @IsOptional()
  @IsBoolean()
  manualReview?: boolean;
}

/** POST /verification/requests/:id/documents — attach a `clean` uploaded
 * file (§2.1, §2.2). */
export const SELFIE_LIVENESS_RESULTS = [
  'passed',
  'not_checked',
  'skipped',
] as const;
export type SelfieLivenessResult = (typeof SELFIE_LIVENESS_RESULTS)[number];
export const SELFIE_CHALLENGES = ['blink', 'turn_left', 'turn_right'] as const;
export const SELFIE_FALLBACK_REASONS = [
  'timeout',
  'detector_unavailable',
] as const;
export const SELFIE_CAPTURE_PLATFORMS = ['android', 'ios', 'web'] as const;

/**
 * Owner 2026-10-28 (docs/architecture/ID_SELFIE_CAPTURE_2026-10-28.md): what
 * the app's guided selfie camera saw. Reported by the app, so the verifier
 * reads it as a hint next to the picture, never as proof.
 */
export class SelfieCaptureMetaDto {
  @ApiProperty({
    enum: SELFIE_LIVENESS_RESULTS,
    description:
      'passed = the random on-device liveness prompt was done; not_checked = ' +
      'no face detector on this device (manual shot); skipped = the attorney ' +
      'used «Take photo anyway» after the timeout (still the live camera).',
  })
  @IsIn(SELFIE_LIVENESS_RESULTS)
  liveness!: SelfieLivenessResult;

  @ApiPropertyOptional({
    enum: SELFIE_CHALLENGES,
    nullable: true,
    description: 'The random prompt shown (blink / turn the head).',
  })
  @IsOptional()
  @IsIn(SELFIE_CHALLENGES)
  challenge?: (typeof SELFIE_CHALLENGES)[number] | null;

  @ApiPropertyOptional({
    enum: SELFIE_FALLBACK_REASONS,
    nullable: true,
    description: 'Why liveness was not passed, when it was not.',
  })
  @IsOptional()
  @IsIn(SELFIE_FALLBACK_REASONS)
  fallbackReason?: (typeof SELFIE_FALLBACK_REASONS)[number] | null;

  @ApiProperty({ description: 'Exactly one face was found in the oval.' })
  @IsBoolean()
  faceDetected!: boolean;

  @ApiProperty({
    description:
      'Text was found where the ID card is held (a soft hint; false = not ' +
      'auto-detected, the verifier checks the picture).',
  })
  @IsBoolean()
  cardDetected!: boolean;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  framesCaptured!: number;

  @ApiProperty({ format: 'date-time', description: 'Camera opened.' })
  @IsDateString()
  startedAt!: string;

  @ApiProperty({ format: 'date-time', description: 'Picture taken.' })
  @IsDateString()
  capturedAt!: string;

  @ApiProperty({ enum: SELFIE_CAPTURE_PLATFORMS })
  @IsIn(SELFIE_CAPTURE_PLATFORMS)
  platform!: (typeof SELFIE_CAPTURE_PLATFORMS)[number];

  @ApiPropertyOptional({ maxLength: 80, description: 'e.g. "iPhone15,2".' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  deviceModel?: string;
}

export class AttachDocumentDto {
  @ApiProperty({ format: 'uuid', description: 'A confirmed, clean upload.' })
  @IsUUID('all')
  fileId!: string;

  @ApiProperty({ enum: VerificationDocType, enumName: 'VerificationDocType' })
  @IsEnum(VerificationDocType)
  docType!: VerificationDocType;

  @ApiPropertyOptional({
    enum: ['front', 'back'],
    description:
      'Identity documents: front/back (back required for drivers_license and state_id).',
  })
  @IsOptional()
  @IsIn(['front', 'back'])
  side?: 'front' | 'back';

  @ApiPropertyOptional({
    example: 'NY',
    description: 'bar_license: the state of the license it proves.',
  })
  @ValidateIf((o: AttachDocumentDto) => o.stateCode !== undefined)
  @Transform(upperTrim)
  @IsString()
  @Length(2, 2)
  stateCode?: string;

  @ApiPropertyOptional({
    type: String,
    maxLength: APPLICANT_COMMENT_MAX,
    description:
      "Owner 2026-10-18: the attorney's optional note to the reviewer, sent " +
      'with the bar card of a number for manual review.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(APPLICANT_COMMENT_MAX)
  note?: string;

  @ApiPropertyOptional({
    maxLength: 64,
    description:
      'Selfie only: the one-time token from POST requests/{id}/selfie-capture ' +
      '(owner 2026-10-28). Required while verification.selfie_live_capture_required ' +
      'is on (default); missing / unknown / used / expired → 400 VALIDATION_ERROR ' +
      'with details.reason capture_token_missing / capture_token_invalid / ' +
      'capture_token_expired.',
  })
  @IsOptional()
  @IsString()
  @Length(16, 64)
  captureToken?: string;

  @ApiPropertyOptional({ type: SelfieCaptureMetaDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SelfieCaptureMetaDto)
  captureMeta?: SelfieCaptureMetaDto;
}
