import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const AD_KINDS = ['profile_bio', 'post', 'promotion'] as const;

/** One state's switches (also the defaults for states not listed). */
export class StateAdRulesDto {
  @ApiProperty({ enum: ['off', 'warn', 'block'] })
  mode!: 'off' | 'warn' | 'block';
  @ApiProperty({ type: [String] })
  disabledRules!: string[];
  @ApiProperty()
  archive!: boolean;
  @ApiProperty({ type: 'integer' })
  retentionYears!: number;
  @ApiProperty()
  disclaimers!: boolean;
  @ApiProperty()
  resultsDisclaimer!: string;
  @ApiProperty()
  adLabel!: string;
  @ApiProperty()
  bidPacksAllowed!: boolean;
  @ApiProperty()
  referralRewardsAllowed!: boolean;
}

export class AttorneyAdsSettingsDto {
  @ApiProperty({ type: StateAdRulesDto })
  defaults!: StateAdRulesDto;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Per-state overrides by 2-letter code (NY, NJ, ...).',
  })
  states!: Record<string, Partial<StateAdRulesDto>>;
  @ApiProperty()
  paidPlacementLabel!: boolean;
}

export class UpdateAttorneyAdsSettingsDto {
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  defaults?: Record<string, unknown>;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      'Replaces the per-state overrides: {"NY": {"mode": "warn", ...}}.',
  })
  @IsOptional()
  @IsObject()
  states?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  paidPlacementLabel?: boolean;
}

export class AdRuleDto {
  @ApiProperty()
  id!: string;
  @ApiProperty({ enum: ['high', 'medium'] })
  severity!: 'high' | 'medium';
  @ApiProperty()
  reference!: string;
  @ApiProperty()
  messageEn!: string;
  @ApiProperty()
  messageRu!: string;
}

export class AdArchiveQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  attorneyId?: string;

  @ApiPropertyOptional({ enum: AD_KINDS })
  @IsOptional()
  @IsIn(AD_KINDS)
  kind?: (typeof AD_KINDS)[number];

  @ApiPropertyOptional({ description: '2-letter state code.' })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  state?: string;

  @ApiPropertyOptional({ description: 'ISO date, from (inclusive).' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date, to (exclusive).' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  to?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

export class AdArchiveRowDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ format: 'uuid' })
  attorneyId!: string;
  @ApiProperty({ enum: AD_KINDS })
  kind!: string;
  @ApiProperty({ format: 'uuid' })
  sourceId!: string;
  @ApiProperty({ type: 'integer' })
  version!: number;
  @ApiProperty()
  content!: string;
  @ApiProperty({ type: [String] })
  disclaimers!: string[];
  @ApiProperty({ type: [String] })
  findings!: string[];
  @ApiProperty({ type: [String] })
  stateCodes!: string[];
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
  @ApiProperty({ format: 'date-time' })
  retainUntil!: string;
}
