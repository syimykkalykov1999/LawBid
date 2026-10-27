import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const STATUSES = [
  'requested',
  'planning',
  'planned',
  'confirmed',
  'applying',
  'done',
  'failed',
  'expired',
  'cancelled',
  'dry_run',
  'rolled_back',
];

export class InfraPlanResourceDto {
  @ApiProperty()
  @IsString()
  @MaxLength(300)
  address!: string;
  @ApiProperty({ description: 'create, update, delete, delete-create, …' })
  @IsString()
  @Matches(/^[a-z-]{2,40}$/)
  action!: string;
}

export class InfraPlanDto {
  @ApiProperty() @IsInt() @Min(0) @Max(100000) add!: number;
  @ApiProperty() @IsInt() @Min(0) @Max(100000) change!: number;
  @ApiProperty() @IsInt() @Min(0) @Max(100000) destroy!: number;
  @ApiProperty({ type: [InfraPlanResourceDto] })
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => InfraPlanResourceDto)
  resources!: InfraPlanResourceDto[];
}

export class InfraPlanReportDto extends InfraPlanDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Values growth.auto.tfvars.json held for these keys before.',
  })
  @IsObject()
  fileBefore!: Record<string, unknown>;
}

export class InfraStatusReportDto {
  @ApiProperty({ enum: ['applying', 'done', 'failed', 'plan_failed'] })
  @IsIn(['applying', 'done', 'failed', 'plan_failed'])
  status!: 'applying' | 'done' | 'failed' | 'plan_failed';
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  error?: string;
  @ApiPropertyOptional({ description: 'main | pr:<url>' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  recorded?: string;
}

export class InfraRequestDto {
  @ApiProperty() id!: string;
  @ApiProperty() itemId!: string;
  @ApiProperty() itemName!: string;
  @ApiProperty({ type: String, nullable: true }) fromState!: string | null;
  @ApiProperty() toState!: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  changes!: Record<string, unknown>;
  @ApiProperty({ enum: STATUSES }) status!: string;
  @ApiProperty({ type: [Number] }) costDeltaUsd!: number[];
  @ApiProperty() dryRun!: boolean;
  @ApiProperty({ type: String, nullable: true }) rollbackOf!: string | null;
  @ApiProperty({ type: InfraPlanDto, nullable: true })
  plan!: InfraPlanDto | null;
  @ApiProperty({ type: String, nullable: true }) runUrl!: string | null;
  @ApiProperty({ type: String, nullable: true }) recorded!: string | null;
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
  @ApiProperty() impact!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: String, nullable: true }) plannedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) expiresAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) finishedAt!: string | null;
}

export class InfraSuggestionDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['off', 'on'] }) to!: string;
  @ApiProperty() reason!: string;
  @ApiProperty({ type: [Number] }) costDeltaUsd!: number[];
}

export class InfraGuardsDto {
  @ApiProperty() dryRun!: boolean;
  @ApiProperty() dailyCap!: number;
  @ApiProperty() quietHours!: string;
  @ApiProperty() configured!: boolean;
  @ApiProperty() inQuietWindow!: boolean;
}

export class InfraOverviewDto {
  @ApiProperty({ type: InfraGuardsDto }) guards!: InfraGuardsDto;
  @ApiProperty({ type: [String] }) switchable!: string[];
  @ApiProperty({ type: [InfraRequestDto] }) requests!: InfraRequestDto[];
  @ApiProperty({ type: [InfraSuggestionDto] })
  suggestions!: InfraSuggestionDto[];
}

export class CreateInfraRequestDto {
  @ApiProperty({ example: 'aws.rds_replicas' })
  @Matches(/^[a-z0-9_.]{3,60}$/)
  itemId!: string;
  @ApiProperty({ enum: ['off', 'on'] })
  @IsIn(['off', 'on'])
  to!: 'off' | 'on';
}

export class InfraJobDto {
  @ApiProperty() id!: string;
  @ApiProperty() itemId!: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  changes!: Record<string, unknown>;
  @ApiProperty() dryRun!: boolean;
  @ApiProperty({ enum: STATUSES }) status!: string;
}

export class InfraDecisionDto {
  @ApiProperty({ enum: ['wait', 'apply', 'stop'] }) decision!: string;
  @ApiProperty({ enum: STATUSES }) status!: string;
}
