import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { tidy } from '../../../common/utils/tidy-text';

export const SIGN_TITLE_MAX = 160;
export const SIGN_NAME_MAX = 120;
export const SIGN_REASON_MAX = 300;
/** A drawn signature: PNG, base64 (≈ 150 KB of bytes). */
export const SIGN_IMAGE_MAX_CHARS = 210_000;

export class CreateSignRequestDto {
  @ApiProperty({
    format: 'uuid',
    description: 'A clean PDF of the sender (case_attachment).',
  })
  @IsUUID('all')
  fileId!: string;

  @ApiProperty({ maxLength: SIGN_TITLE_MAX })
  @Transform(tidy)
  @IsString()
  @MinLength(1)
  @MaxLength(SIGN_TITLE_MAX)
  title!: string;
}

export class SignDto {
  @ApiProperty({ enum: ['drawn', 'typed'] })
  @IsIn(['drawn', 'typed'])
  method!: 'drawn' | 'typed';

  @ApiProperty({
    maxLength: SIGN_NAME_MAX,
    description: 'The name the signer types.',
  })
  @Transform(tidy)
  @IsString()
  @MinLength(2)
  @MaxLength(SIGN_NAME_MAX)
  name!: string;

  @ApiPropertyOptional({
    maxLength: SIGN_IMAGE_MAX_CHARS,
    description: 'Base64 PNG of the drawn signature (method = drawn).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(SIGN_IMAGE_MAX_CHARS)
  imagePngBase64?: string;

  @ApiProperty({
    description: 'The signer agreed to sign and keep records electronically.',
  })
  @Equals(true)
  consent!: boolean;
}

export class DeclineSignDto {
  @ApiPropertyOptional({ maxLength: SIGN_REASON_MAX })
  @IsOptional()
  @Transform(tidy)
  @IsString()
  @MaxLength(SIGN_REASON_MAX)
  reason?: string;
}

export class SignRequestIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  requestId!: string;
}

export class SignatureDto {
  @ApiProperty({ enum: ['client', 'attorney'] }) role!: 'client' | 'attorney';
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['drawn', 'typed'] }) method!: 'drawn' | 'typed';
  @ApiProperty({ format: 'date-time' }) signedAt!: string;
}

export class SignRequestDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: ['pending', 'signed', 'declined', 'canceled'] })
  status!: string;
  @ApiProperty({ enum: ['client', 'attorney'] }) createdByRole!:
    'client' | 'attorney';
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The original PDF.',
  })
  sourceUrl!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The signed PDF, once both signed.',
  })
  finalUrl!: string | null;
  @ApiProperty() sourceSha256!: string;
  @ApiProperty({ type: String, nullable: true }) finalSha256!: string | null;
  @ApiProperty({ type: [SignatureDto] }) signatures!: SignatureDto[];
  @ApiProperty() canSign!: boolean;
  @ApiProperty() canDecline!: boolean;
  @ApiProperty() canCancel!: boolean;
  @ApiProperty({ type: String, nullable: true, enum: ['client', 'attorney'] })
  declinedByRole!: 'client' | 'attorney' | null;
  @ApiProperty({ type: String, nullable: true }) declineReason!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiresAt!: string | null;
  @ApiProperty({
    description:
      'The request ran out of time (its status is then `canceled`); the sender can resend.',
  })
  expired!: boolean;
  @ApiProperty() remindersSent!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastRemindedAt!: string | null;
  @ApiProperty({
    type: () => SignViewDto,
    isArray: true,
    description: 'Audit: when each side opened the waiting document.',
  })
  views!: SignViewDto[];
  @ApiProperty({ description: 'The sender may remind the other side now.' })
  canResend!: boolean;
}

export class SignViewDto {
  @ApiProperty({ enum: ['client', 'attorney'] }) role!: 'client' | 'attorney';
  @ApiProperty({ format: 'date-time' }) at!: string;
}

export class SignVerifyDto {
  @ApiProperty({
    description: 'The original file still has the recorded SHA-256.',
  })
  sourceOk!: boolean;
  @ApiProperty({
    type: Boolean,
    nullable: true,
    description:
      'The signed file still has the recorded SHA-256 (null: not finished).',
  })
  finalOk!: boolean | null;
  @ApiProperty({ description: 'The case journal hash chain is intact.' })
  journalOk!: boolean;
  @ApiProperty({
    description: 'Signatures in the request that the journal also records.',
  })
  journalSignatures!: number;
  @ApiProperty() sourceSha256!: string;
  @ApiProperty({ type: String, nullable: true }) finalSha256!: string | null;
}
