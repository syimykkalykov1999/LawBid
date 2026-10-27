import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export const STAFF_STATUSES = [
  'low_data',
  'ok',
  'yellow',
  'red',
  'green',
] as const;
export const STAFF_WORKSPACES = ['mass', 'finance'] as const;
export const SUGGESTION_KINDS = [
  'warn',
  'more_review',
  'pull',
  'replace',
  'reward',
  'pause',
  'retrain',
] as const;
export const SUGGESTION_STATUSES = [
  'open',
  'applied',
  'dismissed',
  'expired',
] as const;

export class StaffPeopleQueryDto {
  @ApiPropertyOptional({ enum: STAFF_STATUSES, enumName: 'StaffRatingStatus' })
  @IsOptional()
  @IsIn(STAFF_STATUSES)
  status?: (typeof STAFF_STATUSES)[number];

  @ApiPropertyOptional({
    enum: STAFF_WORKSPACES,
    enumName: 'StaffWorkspaceName',
    description: 'Owner only; a head always sees just their own workspace.',
  })
  @IsOptional()
  @IsIn(STAFF_WORKSPACES)
  workspace?: (typeof STAFF_WORKSPACES)[number];

  @ApiPropertyOptional({
    enum: ['worst', 'best'],
    enumName: 'StaffRatingSort',
    default: 'worst',
  })
  @IsOptional()
  @IsIn(['worst', 'best'])
  sort?: 'worst' | 'best';

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 5000, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5000)
  offset?: number;
}

export class StaffShortlistQueryDto {
  @ApiPropertyOptional({
    enum: STAFF_WORKSPACES,
    enumName: 'StaffWorkspaceName',
    description: 'Owner only; a head always sees just their own workspace.',
  })
  @IsOptional()
  @IsIn(STAFF_WORKSPACES)
  workspace?: (typeof STAFF_WORKSPACES)[number];
}

export class StaffSuggestionsQueryDto {
  @ApiPropertyOptional({
    enum: SUGGESTION_STATUSES,
    enumName: 'StaffSuggestionStatus',
    default: 'open',
  })
  @IsOptional()
  @IsIn(SUGGESTION_STATUSES)
  status?: (typeof SUGGESTION_STATUSES)[number];

  @ApiPropertyOptional({
    enum: SUGGESTION_KINDS,
    enumName: 'StaffSuggestionKind',
  })
  @IsOptional()
  @IsIn(SUGGESTION_KINDS)
  kind?: (typeof SUGGESTION_KINDS)[number];

  @ApiPropertyOptional({
    enum: STAFF_WORKSPACES,
    enumName: 'StaffWorkspaceName',
    description: 'Owner only; a head always sees just their own workspace.',
  })
  @IsOptional()
  @IsIn(STAFF_WORKSPACES)
  workspace?: (typeof STAFF_WORKSPACES)[number];

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 5000, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5000)
  offset?: number;
}

export class StaffAdminParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  adminId!: string;
}

export class StaffOpenSuggestionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: SUGGESTION_KINDS, enumName: 'StaffSuggestionKind' })
  kind!: string;
  @ApiProperty() createdAt!: string;
}

export class StaffPersonDto {
  @ApiProperty({ format: 'uuid' }) adminId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: STAFF_WORKSPACES, enumName: 'StaffWorkspaceName' })
  workspace!: string;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: '0-100; null = not enough data.',
  })
  rating!: number | null;
  @ApiProperty({ description: 'Decisions in the window.' }) decisions!: number;
  @ApiProperty({ enum: STAFF_STATUSES, enumName: 'StaffRatingStatus' })
  status!: string;
  @ApiProperty({ type: [String] }) flags!: string[];
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Top-percent place in the workspace (1 = best).',
  })
  rankPct!: number | null;
  @ApiProperty({ type: Number, nullable: true }) accuracy!: number | null;
  @ApiProperty({ type: Number, nullable: true }) clean!: number | null;
  @ApiProperty({ type: Number, nullable: true }) usersVerdict!: number | null;
  @ApiProperty({ type: Number, nullable: true }) speed!: number | null;
  @ApiProperty({ type: [StaffOpenSuggestionDto] })
  openSuggestions!: StaffOpenSuggestionDto[];
}

export class StaffPeopleListDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Date of the nightly snapshot shown (null = none yet).',
  })
  snapshotDate!: string | null;
  @ApiProperty({ type: [StaffPersonDto] }) items!: StaffPersonDto[];
}

export class StaffShortlistDto {
  @ApiProperty({ type: String, nullable: true }) snapshotDate!: string | null;
  @ApiProperty({
    type: [StaffPersonDto],
    description: 'Red and yellow, worst first (at most 20).',
  })
  worst!: StaffPersonDto[];
  @ApiProperty({
    type: [StaffPersonDto],
    description: 'The best (top of the workspace), at most 20.',
  })
  best!: StaffPersonDto[];
}

export class StaffSuggestionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) adminId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: STAFF_WORKSPACES, enumName: 'StaffWorkspaceName' })
  workspace!: string;
  @ApiProperty({ enum: SUGGESTION_KINDS, enumName: 'StaffSuggestionKind' })
  kind!: string;
  @ApiProperty({ enum: SUGGESTION_STATUSES, enumName: 'StaffSuggestionStatus' })
  status!: string;
  @ApiProperty() snapshotDate!: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  evidence!: Record<string, unknown>;
  @ApiProperty() createdAt!: string;
}

export class StaffSuggestionListDto {
  @ApiProperty({ type: [StaffSuggestionDto] }) items!: StaffSuggestionDto[];
}

export class StaffPersonDetailDto extends StaffPersonDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Best / worst decisions, the 8-week trend and the window totals.',
  })
  evidence!: Record<string, unknown>;
  @ApiProperty({
    type: [StaffSuggestionDto],
    description: 'The latest suggestions about this person (any status).',
  })
  suggestions!: StaffSuggestionDto[];
}

export class StaffMyOpenSuggestionDto {
  @ApiProperty({
    enum: ['reward', 'retrain', 'more_review'],
    description: 'Only the soft ones are ever shown to the person themself.',
  })
  kind!: string;
}

export class StaffMyProgressEvidenceDto {
  @ApiProperty({
    type: 'array',
    items: {},
    description: 'The weekly trend of the rating (oldest first).',
  })
  trend!: unknown[];
}

/** «Мой рейтинг»: the worker's OWN nightly rating, nobody else's. */
export class StaffMyProgressDto {
  @ApiProperty({ type: String, format: 'date' }) snapshotDate!: string;
  @ApiProperty({ type: Number, nullable: true }) rating!: number | null;
  @ApiProperty({ enum: STAFF_STATUSES, enumName: 'StaffRatingStatus' })
  status!: string;
  @ApiProperty({ type: 'integer' }) decisions!: number;
  @ApiProperty({ type: Number, nullable: true }) rankPct!: number | null;
  @ApiProperty({ type: [String] }) flags!: string[];
  @ApiProperty({ type: Number, nullable: true }) accuracy!: number | null;
  @ApiProperty({ type: Number, nullable: true }) clean!: number | null;
  @ApiProperty({ type: Number, nullable: true }) usersVerdict!: number | null;
  @ApiProperty({ type: Number, nullable: true }) speed!: number | null;
  @ApiProperty({ type: [StaffMyOpenSuggestionDto] })
  openSuggestions!: StaffMyOpenSuggestionDto[];
  @ApiProperty({ type: () => StaffMyProgressEvidenceDto })
  evidence!: StaffMyProgressEvidenceDto;
}
