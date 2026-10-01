import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ProviderParamDto {
  @ApiProperty({ example: 'bunny_stream' })
  @Matches(/^[a-z_]{2,40}$/)
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
}

export class IntegrationFieldDto {
  @ApiProperty() name!: string;
  @ApiProperty() label!: string;
  @ApiProperty() secret!: boolean;
  @ApiProperty() required!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) hint!: string | null;
}

export class IntegrationVersionDto {
  @ApiProperty() id!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ enum: ['pending', 'active', 'retired'] })
  status!: 'pending' | 'active' | 'retired';
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

export class IntegrationDto {
  @ApiProperty() provider!: string;
  @ApiProperty() label!: string;
  @ApiProperty() description!: string;
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
