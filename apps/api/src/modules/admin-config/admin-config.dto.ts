import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  Allow,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// ---- feature flags (§2.3 item 7) ---------------------------------------

export class FlagKeyParamDto {
  @ApiProperty({ pattern: '^[a-z][a-z0-9_]{1,63}$' })
  @Matches(/^[a-z][a-z0-9_]{1,63}$/)
  key!: string;
}

export class UpdateFlagDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ type: 'integer', minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  rolloutPercent?: number;
}

export class FeatureFlagAdminDto {
  @ApiProperty() key!: string;
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ type: 'integer' }) rolloutPercent!: number;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({
    description: 'Uses a paid third-party service (§2.3 item 7).',
  })
  paid!: boolean;
  @ApiProperty({
    type: [String],
    description: 'Provider env keys this flag needs.',
  })
  requiredKeys!: string[];
  @ApiProperty({
    type: [String],
    description: 'Which of them are not set on the server.',
  })
  missingKeys!: string[];
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) updatedBy!:
    string | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

// ---- app_config (§2.3 item 8) --------------------------------------------

export const CONFIG_VALUE_TYPES = [
  'integer',
  'number',
  'string',
  'boolean',
  'string[]',
  'integer[]',
] as const;
export type ConfigValueType = (typeof CONFIG_VALUE_TYPES)[number];

export class ConfigKeyParamDto {
  @ApiProperty({ pattern: '^[a-z][a-z0-9_.]{1,80}$' })
  @Matches(/^[a-z][a-z0-9_.]{1,80}$/)
  key!: string;
}

export class UpdateConfigDto {
  @ApiProperty({
    description: 'Validated against the key schema (type, min/max, items).',
  })
  // Any JSON shape passes the whitelist; the key schema decides.
  @Allow()
  value!: unknown;
}

export class ConfigEntryDto {
  @ApiProperty() key!: string;
  @ApiProperty({ enum: CONFIG_VALUE_TYPES }) type!: ConfigValueType;
  @ApiProperty({
    type: Object,
    description: 'Current value (default when the row is missing).',
  })
  value!: unknown;
  @ApiProperty({ type: Object, nullable: true, description: 'Spec default.' })
  defaultValue!: unknown;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: Number, nullable: true }) min!: number | null;
  @ApiProperty({ type: Number, nullable: true }) max!: number | null;
  @ApiProperty({
    description: 'A row exists in app_config (else the default applies).',
  })
  stored!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  updatedAt!: string | null;
}

// ---- languages (§2.3 item 9) ----------------------------------------------

export class LanguageCodeParamDto {
  @ApiProperty({ pattern: '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$' })
  @Matches(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/)
  code!: string;
}

export class UpdateLanguageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: 'integer', minimum: 0, maximum: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  sort?: number;
}

export class LanguageAdminDto {
  @ApiProperty() code!: string;
  @ApiProperty() nameNative!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() isRtl!: boolean;
  @ApiProperty({ type: 'integer' }) sort!: number;
  @ApiProperty({ type: 'integer' }) translations!: number;
  @ApiProperty({
    type: 'integer',
    description: 'Bundle version (0 = none yet).',
  })
  bundleVersion!: number;
}

// ---- legal documents (§2.3 item 10) ----------------------------------------

export const LEGAL_DOC_TYPES = [
  'terms',
  'privacy',
  'disclaimer',
  'client_contact_sharing',
] as const;

export class CreateLegalDocumentDto {
  @ApiProperty({ enum: LEGAL_DOC_TYPES })
  @IsIn(LEGAL_DOC_TYPES)
  docType!: (typeof LEGAL_DOC_TYPES)[number];

  @ApiProperty({ example: 'en' })
  @Matches(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/)
  locale!: string;

  @ApiProperty({ example: '1.1', pattern: '^\\d+(\\.\\d+){0,2}$' })
  @Matches(/^\d+(\.\d+){0,2}$/)
  version!: string;

  @ApiPropertyOptional({
    description: 'Markdown body (either this or contentUrl).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  contentMd?: string;

  @ApiPropertyOptional({ format: 'uri' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  contentUrl?: string;
}

export class LegalDocumentIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class LegalDocumentAdminDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: LEGAL_DOC_TYPES }) docType!: string;
  @ApiProperty() locale!: string;
  @ApiProperty() version!: string;
  @ApiProperty() isCurrent!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  publishedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) contentUrl!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Markdown; full text in the detail call.',
  })
  contentMd!: string | null;
  @ApiProperty({
    type: 'integer',
    description: 'Consents recorded against this version.',
  })
  consents!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
