import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import type { ReindexStatus } from '../search/search-reindex.service';

const ENTITIES = ['person', 'case', 'post', 'question', 'tag'];
const PHASES = [
  'building',
  'built',
  'read_swapped',
  'write_swapped',
  'completed',
  'rolled_back',
  'cancelled',
];

export class StartSearchReindexDto {
  @ApiPropertyOptional({
    enum: ['postgres', 'engine'],
    description:
      'postgres (default): rebuild documents from the database. engine: copy inside the engine with the native _reindex task (documents keep their shape).',
  })
  @IsOptional()
  @IsIn(['postgres', 'engine'])
  source?: 'postgres' | 'engine';
}

export class SearchIndexGenerationDto {
  @ApiProperty() name!: string;
  @ApiProperty() generation!: number;
  @ApiProperty() docs!: number;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty({
    enum: ['read', 'write', 'read+write', 'building', 'rollback', 'idle'],
  })
  role!: string;
}

export class SearchIndexEntityDto {
  @ApiProperty({ enum: ENTITIES }) entity!: string;
  @ApiProperty({ type: String, nullable: true }) readTarget!: string | null;
  @ApiProperty({ type: String, nullable: true }) writeTarget!: string | null;
  @ApiProperty({ description: 'The live mapping is older than the code.' })
  mappingOutdated!: boolean;
  @ApiProperty({ type: [SearchIndexGenerationDto] })
  indexes!: SearchIndexGenerationDto[];
}

export class SearchIndexVerifyDto {
  @ApiProperty({ enum: ENTITIES }) entity!: string;
  @ApiProperty() live!: number;
  @ApiProperty() next!: number;
  @ApiProperty() sampled!: number;
  @ApiProperty() mismatched!: number;
  @ApiProperty() ok!: boolean;
  @ApiPropertyOptional() note?: string;
}

export class SearchIndexStatusDto {
  @ApiProperty() engineConfigured!: boolean;
  @ApiProperty({ description: 'Mapping revision in the code.' })
  mappingVersion!: number;
  @ApiProperty({ enum: PHASES, nullable: true, type: String })
  phase!: string | null;
  @ApiProperty({ enum: ['postgres', 'engine'], nullable: true, type: String })
  source!: string | null;
  @ApiProperty({ type: String, nullable: true }) startedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
  @ApiProperty({ type: String, nullable: true, enum: [...ENTITIES] })
  progressEntity!: string | null;
  @ApiProperty({ description: 'Documents written to the new index so far.' })
  progressIndexed!: number;
  @ApiProperty({ description: 'Native copy: documents to copy (0 unknown).' })
  progressTotal!: number;
  @ApiProperty({ description: 'Native copy: documents copied so far.' })
  progressDone!: number;
  @ApiProperty({ type: Boolean, nullable: true }) verifyOk!: boolean | null;
  @ApiProperty({ type: String, nullable: true }) verifiedAt!: string | null;
  @ApiProperty({ type: [SearchIndexVerifyDto] })
  verify!: SearchIndexVerifyDto[];
  @ApiProperty({ type: String, nullable: true })
  retainUntil!: string | null;
  @ApiProperty({
    enum: ['read', 'write'],
    nullable: true,
    type: String,
    description: 'What the Swap button does now.',
  })
  nextSwap!: string | null;
  @ApiProperty() canStart!: boolean;
  @ApiProperty() canSwap!: boolean;
  @ApiProperty() canRollback!: boolean;
  @ApiProperty({ type: [SearchIndexEntityDto] })
  entities!: SearchIndexEntityDto[];
}

export function toSearchIndexStatusDto(s: ReindexStatus): SearchIndexStatusDto {
  const st = s.state;
  return {
    engineConfigured: s.engineConfigured,
    mappingVersion: s.mappingVersion,
    phase: st?.phase ?? null,
    source: st?.source ?? null,
    startedAt: st?.startedAt ?? null,
    error: st?.error ?? null,
    progressEntity: st?.progress.entity ?? null,
    progressIndexed: st?.progress.indexed ?? 0,
    progressTotal: st?.progress.taskTotal ?? 0,
    progressDone: st?.progress.taskDone ?? 0,
    verifyOk: st?.verify?.ok ?? null,
    verifiedAt: st?.verify?.at ?? null,
    verify: Object.entries(st?.verify?.entities ?? {}).flatMap(([entity, v]) =>
      v ? [{ entity, ...v }] : [],
    ),
    retainUntil: st?.retainUntil ?? null,
    nextSwap: s.nextSwap,
    canStart: s.can.start,
    canSwap: s.can.swap,
    canRollback: s.can.rollback,
    entities: s.entities,
  };
}
