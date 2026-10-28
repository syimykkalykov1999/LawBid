import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DealRecordStatus, FeeType, PartyRole } from '@prisma/client';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaymentTermsDto } from '../../bids/bids.public';

export const DEAL_SIGN_NAME_MIN = 2;
export const DEAL_SIGN_NAME_MAX = 120;
/** ≈150 KB of PNG as base64 (same cap as the Docs-tab signing). */
export const DEAL_SIGN_IMAGE_MAX_CHARS = 210_000;
export const DEAL_DECLINE_REASON_MAX = 300;

export class DealCaseIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class DealRecordIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class CreateDealRecordDto {
  @ApiProperty({ format: 'uuid', description: 'The bid being accepted.' })
  @IsUUID('all')
  bidId!: string;
}

export class SignDealRecordDto {
  @ApiProperty({
    minLength: DEAL_SIGN_NAME_MIN,
    maxLength: DEAL_SIGN_NAME_MAX,
    description:
      'Full name as the signer wants it printed under the signature.',
  })
  @IsString()
  @MinLength(DEAL_SIGN_NAME_MIN)
  @MaxLength(DEAL_SIGN_NAME_MAX)
  name!: string;

  @ApiProperty({
    maxLength: DEAL_SIGN_IMAGE_MAX_CHARS,
    description: 'The drawn signature: PNG with alpha, base64, ≤150 KB.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(DEAL_SIGN_IMAGE_MAX_CHARS)
  imagePngBase64!: string;
}

export class DeclineDealRecordDto {
  @ApiPropertyOptional({ maxLength: DEAL_DECLINE_REASON_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(DEAL_DECLINE_REASON_MAX)
  reason?: string;
}

export class AttachAgreementDto {
  @ApiProperty({
    format: 'uuid',
    description:
      "The attorney's own agreement PDF (an uploaded case_attachment file of the caller).",
  })
  @IsUUID('all')
  fileId!: string;
}

export class DealPartyDto {
  @ApiProperty() fullName!: string;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) username!: string | null;
}

export class DealAttorneyDto extends DealPartyDto {
  @ApiProperty({ type: String, nullable: true }) barState!: string | null;
  @ApiProperty({ type: String, nullable: true }) barNumber!: string | null;
  @ApiProperty({ type: String, nullable: true }) firmName!: string | null;
}

export class DealTermsDto {
  @ApiProperty({ enum: FeeType, enumName: 'FeeType' }) feeType!: FeeType;
  @ApiProperty({ type: 'integer' }) amountCents!: number;
  @ApiProperty({ type: 'integer', nullable: true }) percentBps!: number | null;
  @ApiPropertyOptional({ type: () => PaymentTermsDto, nullable: true })
  paymentTerms!: PaymentTermsDto | null;
}

export class DealOfferDto extends DealTermsDto {
  @ApiProperty({ type: 'integer' }) roundNo!: number;
  @ApiProperty({ enum: PartyRole, enumName: 'PartyRole' }) fromRole!: PartyRole;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, nullable: true }) message!: string | null;
  @ApiProperty() status!: string;
}

export class DealCaseDto {
  @ApiProperty() title!: string;
  @ApiProperty({ type: String, nullable: true }) practice!: string | null;
  @ApiProperty({ type: [String] }) states!: string[];
}

export class DealSignatureDto {
  @ApiProperty({ enum: PartyRole, enumName: 'PartyRole' }) role!: PartyRole;
  @ApiProperty() name!: string;
  @ApiProperty({ format: 'date-time' }) signedAt!: string;
}

/**
 * Deal record 2026-10-27: the record as both parties see it. The snapshot
 * fields are frozen at creation (plan §3); the URLs are short-lived signed
 * links to the ordinary case files (the PDF without signatures, the sealed
 * PDF, the attorney's own agreement).
 */
export class DealRecordDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) caseId!: string;
  @ApiProperty({ format: 'uuid' }) bidId!: string;
  @ApiProperty({ enum: DealRecordStatus, enumName: 'DealRecordStatus' })
  status!: DealRecordStatus;
  @ApiProperty({
    enum: PartyRole,
    enumName: 'PartyRole',
    description: 'Who tapped Accept (signs first).',
  })
  acceptedBy!: PartyRole;
  @ApiProperty({
    enum: PartyRole,
    enumName: 'PartyRole',
    description: "The caller's side.",
  })
  myRole!: PartyRole;
  @ApiProperty({
    description: 'True while the caller may draw their signature now.',
  })
  myTurnToSign!: boolean;
  @ApiProperty({
    description: '<8 of id>-<8 of SHA-256>, printed on every page.',
  })
  recordCode!: string;
  @ApiProperty({ description: 'SHA-256 of the canonical snapshot.' })
  snapshotSha256!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'SHA-256 of the sealed PDF.',
  })
  sealedSha256!: string | null;
  @ApiProperty({
    type: 'integer',
    description: 'Version of the admin texts the record was created with.',
  })
  textVersion!: number;
  @ApiProperty({ format: 'date-time' }) acceptedAt!: string;
  @ApiProperty({ type: () => DealCaseDto }) case!: DealCaseDto;
  @ApiProperty({ type: () => DealPartyDto }) client!: DealPartyDto;
  @ApiProperty({ type: () => DealAttorneyDto }) attorney!: DealAttorneyDto;
  @ApiProperty({ type: () => DealTermsDto }) terms!: DealTermsDto;
  @ApiProperty({ type: () => DealOfferDto, isArray: true })
  history!: DealOfferDto[];
  @ApiProperty({ description: 'The fixed line under the title (English).' })
  notContractText!: string;
  @ApiProperty({ description: 'The footer of every page (English).' })
  footerText!: string;
  @ApiProperty({ type: () => DealSignatureDto, isArray: true })
  signatures!: DealSignatureDto[];
  @ApiProperty({ type: String, nullable: true }) unsignedUrl!: string | null;
  @ApiProperty({ type: String, nullable: true }) sealedUrl!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) sealedFileId!:
    string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  unsignedFileId!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  agreementFileId!: string | null;
  @ApiProperty({ type: String, nullable: true }) agreementUrl!: string | null;
  @ApiProperty({ type: String, nullable: true }) declineReason!: string | null;
  @ApiProperty({ type: String, nullable: true }) failedReason!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  sealedAt!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  declinedAt!: string | null;
}

export class DealRecordLookupDto {
  @ApiProperty({ type: () => DealRecordDto, nullable: true })
  record!: DealRecordDto | null;
}
