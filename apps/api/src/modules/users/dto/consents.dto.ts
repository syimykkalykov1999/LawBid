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

export class ConsentItemDto {
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
