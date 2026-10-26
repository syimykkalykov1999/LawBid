import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ConsentType } from '@prisma/client';

/** The schema order, spelled out: the swagger plugin's enum read from the
 * Prisma client came out in a different order on different machines, so
 * the generated contract flapped in CI. */
const CONSENT_TYPES: ConsentType[] = [
  'terms',
  'privacy',
  'disclaimer',
  'client_contact_sharing',
  'age_18',
  'marketing_email',
  'marketing_push',
  'analytics',
  'attorney_agreement',
  'client_agreement',
  'eula',
  'do_not_sell',
];

export class ConsentItemDto {
  @ApiProperty({ enum: CONSENT_TYPES })
  @IsEnum(ConsentType)
  type!: ConsentType;

  @IsBoolean()
  granted!: boolean;

  @IsOptional()
  @IsUUID()
  documentId?: string;
}

/** docs/01_FOUNDATION_AUTH.md §10.2 step H. Records whatever the client
 * sends as an append-only UserConsent row per item — this endpoint does
 * not itself enforce that age_18/terms/privacy/disclaimer are granted;
 * that gate belongs to onboarding's own guard logic (file 1 §11, not yet
 * built), not to the generic "save consents" persistence endpoint. */
export class SaveConsentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConsentItemDto)
  consents!: ConsentItemDto[];
}
