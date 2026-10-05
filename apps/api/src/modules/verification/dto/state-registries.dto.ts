import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { REGISTRY_ADAPTER_TYPES } from '../providers/bar-lookup/state-bar-adapter';

const trimUpper = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class StateCodeParamDto {
  @ApiProperty({ example: 'NY' })
  @Transform(trimUpper)
  @IsString()
  @Length(2, 2)
  stateCode!: string;
}

export class RegistryFieldDescriptorDto {
  @ApiProperty()
  name!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  required!: boolean;

  @ApiPropertyOptional()
  placeholder?: string;

  @ApiPropertyOptional()
  help?: string;

  @ApiPropertyOptional({ type: String, isArray: true })
  options?: string[];
}

export class RegistryAdapterDescriptorDto {
  @ApiProperty({ enum: REGISTRY_ADAPTER_TYPES })
  type!: (typeof REGISTRY_ADAPTER_TYPES)[number];

  @ApiProperty()
  label!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ type: RegistryFieldDescriptorDto, isArray: true })
  fields!: RegistryFieldDescriptorDto[];

  @ApiProperty({ enum: ['none', 'optional', 'required'] })
  secret!: 'none' | 'optional' | 'required';

  @ApiPropertyOptional()
  secretLabel?: string;
}

export class StateRegistryDto {
  @ApiProperty({ example: 'NY' })
  stateCode!: string;

  @ApiProperty({ example: 'New York' })
  stateName!: string;

  @ApiProperty({ enum: REGISTRY_ADAPTER_TYPES })
  adapter!: (typeof REGISTRY_ADAPTER_TYPES)[number];

  @ApiProperty({
    description: 'Licenses of this state are checked automatically.',
  })
  enabled!: boolean;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Non-secret settings of the adapter.',
  })
  config!: Record<string, string>;

  @ApiProperty()
  hasSecret!: boolean;

  @ApiProperty({ type: String, nullable: true, example: '••••a1b2' })
  secretMasked!: string | null;

  @ApiProperty({ type: String, nullable: true })
  testBarNumber!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastTestAt!: string | null;

  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  lastTestResult!: Record<string, unknown> | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  updatedAt!: string | null;
}

export class StateRegistriesOverviewDto {
  @ApiProperty({ description: 'The server can store keys (master key set).' })
  secretsEnabled!: boolean;

  @ApiProperty({ type: RegistryAdapterDescriptorDto, isArray: true })
  adapterTypes!: RegistryAdapterDescriptorDto[];

  @ApiProperty({ type: StateRegistryDto, isArray: true })
  items!: StateRegistryDto[];
}

export class SaveStateRegistryDto {
  @ApiProperty({ enum: REGISTRY_ADAPTER_TYPES })
  @IsIn(REGISTRY_ADAPTER_TYPES)
  adapter!: (typeof REGISTRY_ADAPTER_TYPES)[number];

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, string>;

  @ApiPropertyOptional({ description: 'A new key; empty keeps the saved one.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  secret?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  clearSecret?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  testBarNumber?: string;
}

export class TestStateRegistryDto {
  @ApiProperty({ example: '1234567' })
  @IsString()
  @Length(1, 40)
  barNumber!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;
}

export class RegistryTestResultDto {
  @ApiProperty({ enum: ['pass', 'fail', 'manual_review', 'error'] })
  result!: 'pass' | 'fail' | 'manual_review' | 'error';

  @ApiProperty({ type: 'object', additionalProperties: true })
  details!: Record<string, unknown>;

  @ApiProperty({ type: String, nullable: true })
  error!: string | null;

  @ApiProperty({ format: 'date-time' })
  testedAt!: string;
}

export class CopyStateRegistryDto {
  @ApiProperty({ type: String, isArray: true, example: ['CA', 'TX'] })
  @IsArray()
  @ArrayMaxSize(51)
  @IsString({ each: true })
  @Length(2, 2, { each: true })
  states!: string[];
}

export class CopyStateRegistryResultDto {
  @ApiProperty({ type: String, isArray: true })
  copied!: string[];
}
