import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const SLOT = /^[a-z0-9_-]{1,30}$/;

export class ProviderParamDto {
  @ApiProperty({ example: 'bunny_stream' })
  @Matches(/^[a-z0-9_]{2,48}$/)
  provider!: string;
}

export class VersionParamDto extends ProviderParamDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  version!: number;
}

export class CreateIntegrationVersionDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description:
      'Field → value. A blank secret keeps the value of the newest version.',
  })
  @IsObject()
  values!: Record<string, string>;

  @ApiPropertyOptional({
    description:
      'Owner 2026-10-05: key set ("main" by default). A new name adds another set (backup key, second account).',
    example: 'backup',
  })
  @IsOptional()
  @Matches(SLOT)
  slot?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string | null;
}

export class SlotParamDto extends ProviderParamDto {
  @ApiProperty({ example: 'backup' })
  @Matches(SLOT)
  slot!: string;
}

export class SlotBodyDto {
  @ApiPropertyOptional({ description: 'Key set; "main" when omitted.' })
  @IsOptional()
  @Matches(SLOT)
  slot?: string;
}

export class UpdateIntegrationSlotDto {
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string | null;

  @ApiPropertyOptional({ description: 'Off: the API skips this key set.' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class ReorderIntegrationSlotsDto {
  @ApiProperty({
    type: [String],
    description: 'Key sets in the order the API tries them.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @Matches(SLOT, { each: true })
  slots!: string[];
}

export class CustomIntegrationFieldDto {
  @ApiProperty({ example: 'apiKey' })
  @Matches(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/)
  name!: string;

  @ApiProperty({ example: 'API key' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label!: string;

  @ApiProperty({ description: 'Write-only and masked when true.' })
  @IsBoolean()
  secret!: boolean;

  @ApiProperty()
  @IsBoolean()
  required!: boolean;
}

export class CreateCustomIntegrationDto {
  @ApiProperty({
    description: 'Latin letters, digits, _ ; stored as custom_<id>.',
    example: 'courtlistener',
  })
  @Matches(/^(custom_)?[a-z0-9_]{2,40}$/)
  id!: string;

  @ApiProperty({ example: 'CourtListener' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  label!: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty({ type: [CustomIntegrationFieldDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CustomIntegrationFieldDto)
  fields!: CustomIntegrationFieldDto[];
}

export class CustomIntegrationCreatedDto {
  @ApiProperty({ example: 'custom_courtlistener' }) provider!: string;
}

export class ActivateIntegrationDto {
  @ApiPropertyOptional({
    description: 'Activate without a passed test (not recommended).',
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class RemoveIntegrationDto {
  @ApiProperty({ description: 'Type the provider id to confirm.' })
  @IsString()
  confirm!: string;

  @ApiPropertyOptional({
    description: 'Only this key set; every set when omitted.',
  })
  @IsOptional()
  @Matches(SLOT)
  slot?: string;
}

export class IntegrationFieldDto {
  @ApiProperty() name!: string;
  @ApiProperty() label!: string;
  @ApiProperty() secret!: boolean;
  @ApiProperty() required!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) hint!: string | null;
}

/** Owner 2026-10-06: the full saved values (owner's eye button only). */
export class IntegrationRevealDto {
  @ApiProperty() version!: number;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  values!: Record<string, string>;
}

export class IntegrationVersionDto {
  @ApiProperty() id!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ enum: ['pending', 'active', 'retired'] })
  status!: 'pending' | 'active' | 'retired';
  @ApiProperty({ example: 'main' }) slot!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  label!: string | null;
  @ApiProperty() priority!: number;
  @ApiProperty() enabled!: boolean;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Public values in full; secrets as ••••last4.',
  })
  masked!: Record<string, string>;
  @ApiProperty() fingerprint!: string;
  @ApiProperty() createdAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  activatedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  lastTestAt!: string | null;
  @ApiPropertyOptional({ type: Boolean, nullable: true })
  lastTestOk!: boolean | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  lastTestError!: string | null;
}

export class IntegrationSlotDto {
  @ApiProperty() slot!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  label!: string | null;
  @ApiProperty() priority!: number;
  @ApiProperty() enabled!: boolean;
  @ApiPropertyOptional({ type: IntegrationVersionDto, nullable: true })
  active!: IntegrationVersionDto | null;
  @ApiPropertyOptional({ type: IntegrationVersionDto, nullable: true })
  pending!: IntegrationVersionDto | null;
}

export class IntegrationDto {
  @ApiProperty() provider!: string;
  @ApiProperty() label!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ description: 'Added from the admin (can be deleted).' })
  custom!: boolean;
  @ApiProperty() restartRequired!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true })
  warning!: string | null;
  @ApiProperty() testable!: boolean;
  @ApiProperty({ type: [IntegrationFieldDto] })
  fields!: IntegrationFieldDto[];
  @ApiProperty({ enum: ['db', 'env', 'none'] })
  source!: 'db' | 'env' | 'none';
  @ApiProperty() configured!: boolean;
  @ApiPropertyOptional({ type: IntegrationVersionDto, nullable: true })
  active!: IntegrationVersionDto | null;
  @ApiPropertyOptional({ type: IntegrationVersionDto, nullable: true })
  pending!: IntegrationVersionDto | null;
  @ApiProperty({
    type: [IntegrationSlotDto],
    description: 'Key sets in the order the API tries them.',
  })
  slots!: IntegrationSlotDto[];
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'The key set the API uses right now (null: env or none).',
  })
  inUse!: string | null;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    nullable: true,
    description: 'Masked env values while the server env is the source.',
  })
  envMasked!: Record<string, string> | null;
}

export class IntegrationsOverviewDto {
  @ApiProperty({
    description:
      'False until SECRETS_MASTER_KEYS is set on the server (read-only view).',
  })
  storageEnabled!: boolean;
  @ApiProperty({ type: [IntegrationDto] }) items!: IntegrationDto[];
}
