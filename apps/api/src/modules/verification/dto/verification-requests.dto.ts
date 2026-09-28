import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VerificationDocType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
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

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    nullable: true,
    description: 'License expiry (YYYY-MM-DD), if the license has one.',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'expiresAt must be YYYY-MM-DD' })
  expiresAt?: string | null;
}

/** POST /verification/requests/:id/documents — attach a `clean` uploaded
 * file (§2.1, §2.2). */
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
}
