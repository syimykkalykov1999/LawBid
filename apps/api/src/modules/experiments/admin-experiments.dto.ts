import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { EXPERIMENT_KEY_RE, SURFACE_RE } from './experiment-definition';

export class ExperimentIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;
}

export class ExperimentVariantDto {
  @ApiProperty({ example: 'control' })
  @IsString()
  @MaxLength(32)
  key!: string;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  weight!: number;
}

export class ExperimentGuardrailsDto {
  @ApiPropertyOptional({
    type: 'integer',
    description:
      'Stop when reports per 1000 impressions grow by more than this percent vs control.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  reportsRelIncreasePct?: number;

  @ApiPropertyOptional({
    type: 'integer',
    description: 'Same for errors per 1000 impressions.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  errorsRelIncreasePct?: number;

  @ApiPropertyOptional({
    type: 'integer',
    description:
      'Do not judge a guardrail before this many impressions per variant.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(1_000_000)
  minImpressions?: number;
}

export class CreateExperimentDto {
  @ApiProperty({ pattern: EXPERIMENT_KEY_RE.source })
  @Matches(EXPERIMENT_KEY_RE)
  key!: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  hypothesis?: string;

  @ApiProperty({ pattern: SURFACE_RE.source, example: 'case_feed' })
  @Matches(SURFACE_RE)
  surface!: string;

  @ApiProperty({ type: [ExperimentVariantDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => ExperimentVariantDto)
  variants!: ExperimentVariantDto[];

  @ApiPropertyOptional({ type: ExperimentGuardrailsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExperimentGuardrailsDto)
  guardrails?: ExperimentGuardrailsDto;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Stops by itself at this moment.',
  })
  @IsOptional()
  @IsDateString()
  endAt?: string;
}

export class StartExperimentDto {
  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: 100,
    description: 'Share of users who enter the test (5-10 to begin).',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  trafficPercent!: number;
}

export class StopExperimentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class ExperimentResultDto {
  @ApiProperty({ format: 'date-time' }) computedAt!: string;
  @ApiProperty({ type: Number, nullable: true }) srmP!: number | null;
  @ApiProperty() srmFlag!: boolean;
  @ApiProperty() guardrailTripped!: boolean;
  @ApiProperty({
    type: [String],
    description: 'Plain-Russian lines for the page.',
  })
  summary!: string[];
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Full report: exposures, per-variant metrics with intervals.',
  })
  report!: Record<string, unknown>;
}

export class ExperimentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() key!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) hypothesis!: string | null;
  @ApiProperty() surface!: string;
  @ApiProperty({ enum: ['draft', 'running', 'stopped'] }) status!: string;
  @ApiProperty({ type: [ExperimentVariantDto] })
  variants!: ExperimentVariantDto[];
  @ApiProperty({ type: 'integer' }) trafficPercent!: number;
  @ApiProperty({ type: ExperimentGuardrailsDto })
  guardrails!: ExperimentGuardrailsDto;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) endAt!:
    string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  stoppedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) stopReason!: string | null;
  @ApiProperty() stoppedBySystem!: boolean;
  @ApiProperty({
    type: 'integer',
    description: 'Units that have been given a variant.',
  })
  exposed!: number;
  @ApiProperty({ type: ExperimentResultDto, nullable: true })
  latest!: ExperimentResultDto | null;
}
