import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class SynonymTermDto {
  @ApiProperty({ example: 'ru', description: 'Language code of the phrase.' })
  @IsString()
  @Matches(/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i)
  lang!: string;

  @ApiProperty({ example: 'расторжение брака' })
  @IsString()
  @Length(2, 120)
  term!: string;
}

export class SynonymGroupDto {
  @ApiProperty()
  id!: string;
  @ApiProperty({ example: 'divorce' })
  key!: string;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Code of the practice area the group points at.',
  })
  practiceCode!: string | null;
  @ApiProperty()
  enabled!: boolean;
  @ApiProperty({ enum: ['seed', 'admin', 'import'] })
  source!: string;
  @ApiProperty({ type: SynonymTermDto, isArray: true })
  terms!: SynonymTermDto[];
}

export class SynonymGroupPageDto {
  @ApiProperty({ type: SynonymGroupDto, isArray: true })
  items!: SynonymGroupDto[];
  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
  @ApiProperty({ description: 'All groups, enabled or not.' })
  total!: number;
  @ApiProperty({ description: 'Phrases in all groups.' })
  terms!: number;
}

export class SynonymListQueryDto {
  @ApiPropertyOptional({ description: 'Part of a key or of a phrase.' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  q?: string;

  @ApiPropertyOptional({
    description: 'Only groups with a phrase in this language.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i)
  lang?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 300)
  cursor?: string;
}

export class SynonymIdParamDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[0-9a-f-]{36}$/i)
  id!: string;
}

export class CreateSynonymGroupDto {
  @ApiProperty({ example: 'divorce', description: 'Short unique name.' })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9._-]{1,118}$/)
  key!: string;

  @ApiPropertyOptional({
    description: 'Practice area code the group points at.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  practiceCode?: string;

  @ApiProperty({ type: SynonymTermDto, isArray: true })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SynonymTermDto)
  terms!: SynonymTermDto[];
}

export class UpdateSynonymGroupDto {
  @ApiPropertyOptional({
    nullable: true,
    description: 'A practice code, or null to detach.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  practiceCode?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    type: SynonymTermDto,
    isArray: true,
    description: 'Replaces the whole list of phrases.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SynonymTermDto)
  terms?: SynonymTermDto[];
}

export class AddSynonymTermDto extends SynonymTermDto {}

export class ImportSynonymGroupDto {
  @ApiProperty({ example: 'divorce' })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9._-]{1,118}$/)
  key!: string;

  @ApiPropertyOptional({ example: 'family_law.divorce' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  practice?: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'array', items: { type: 'string' } },
    example: { en: ['divorce'], ru: ['развод', 'расторжение брака'] },
  })
  @IsObject()
  terms!: Record<string, string[]>;
}

export class ImportSynonymsDto {
  @ApiProperty({ type: ImportSynonymGroupDto, isArray: true })
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ImportSynonymGroupDto)
  groups!: ImportSynonymGroupDto[];
}

export class ImportSynonymsResultDto {
  @ApiProperty()
  groupsCreated!: number;
  @ApiProperty()
  groupsUpdated!: number;
  @ApiProperty()
  termsAdded!: number;
  @ApiProperty({ type: String, isArray: true })
  unknownPractices!: string[];
}

export class SynonymTestQueryDto {
  @ApiProperty()
  @IsString()
  @Length(2, 100)
  q!: string;
}

export class SynonymTestDto {
  @ApiProperty({ type: String, isArray: true })
  groupKeys!: string[];
  @ApiProperty({ type: String, isArray: true })
  practiceCodes!: string[];
}

export class SearchStatsQueryDto {
  @ApiPropertyOptional({ default: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  days?: number;
}

export class SearchQueryStatDto {
  @ApiProperty()
  q!: string;
  @ApiProperty()
  count!: number;
  @ApiProperty({ description: 'Different people who asked.' })
  people!: number;
  @ApiProperty({ type: String, isArray: true })
  scopes!: string[];
  @ApiProperty()
  lastAt!: string;
}

export class SearchLearnedLinkDto {
  @ApiProperty()
  q!: string;
  @ApiProperty()
  practiceCode!: string;
  @ApiProperty({ description: 'People who opened it after this query.' })
  score!: number;
}

export class SearchOverviewDto {
  @ApiProperty({ description: 'Queries in the period.' })
  queries!: number;
  @ApiProperty({ description: 'Of them found nothing.' })
  noResults!: number;
  @ApiProperty({ description: 'Results opened after a query.' })
  clicks!: number;
}
