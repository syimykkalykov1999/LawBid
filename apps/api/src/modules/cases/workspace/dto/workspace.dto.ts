import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  Max,
  Min,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { tidy } from '../../../../common/utils/tidy-text';

/** Owner 2026-10-13 limits: a task title, text and note; files per send
 * and the note on each file. (The MB per file is the admin's «Кейсы».) */
export const TASK_TITLE_MAX = 200;
export const TASK_TEXT_MAX = 5000;
export const NOTE_MAX = 1000;
export const FILE_NOTE_MAX = 500;
export const FILES_PER_SEND_MAX = 20;
export const UPDATE_TEXT_MAX = 5000;
export const TASK_ITEMS_MAX = 30;

export class CaseFileInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  fileId!: string;

  @ApiPropertyOptional({
    description: 'A sample / form, not the answer itself.',
  })
  @IsOptional()
  @IsBoolean()
  sample?: boolean;

  @ApiPropertyOptional({ maxLength: FILE_NOTE_MAX })
  @IsOptional()
  @Transform(tidy)
  @IsString()
  @MaxLength(FILE_NOTE_MAX)
  description?: string;
}

export class CreateCaseTaskDto {
  /// Owner 2026-10-15: both sides can add tasks. `joint` is a task of both
  /// (either side ticks it); the client may add `for_client` (their own
  /// to-do, the attorney sees it) and `joint`.
  @ApiProperty({ enum: ['private', 'shared', 'for_client', 'joint'] })
  @IsIn(['private', 'shared', 'for_client', 'joint'])
  kind!: 'private' | 'shared' | 'for_client' | 'joint';

  @ApiProperty({ maxLength: TASK_TITLE_MAX })
  @Transform(tidy)
  @IsString()
  @MinLength(1)
  @MaxLength(TASK_TITLE_MAX)
  title!: string;

  @ApiPropertyOptional({ maxLength: TASK_TEXT_MAX })
  @IsOptional()
  @Transform(tidy)
  @IsString()
  @MaxLength(TASK_TEXT_MAX)
  description?: string;

  /// When it is due (the calendar of the compose strip).
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  /// Minutes before dueAt for the attorney's reminder (a planner entry).
  @ApiPropertyOptional({ minimum: 0, maximum: 20160 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20160)
  remindBeforeMin?: number;

  /// A checklist for a for-client task: one line per thing to send.
  @ApiPropertyOptional({
    type: [String],
    maxItems: TASK_ITEMS_MAX,
    description: 'Checklist lines of a for-client task, each up to 200.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TASK_ITEMS_MAX)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(TASK_TITLE_MAX, { each: true })
  items?: string[];

  /// The attorney's own materials for the client (a form to sign...).
  @ApiPropertyOptional({
    type: [CaseFileInputDto],
    maxItems: FILES_PER_SEND_MAX,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(FILES_PER_SEND_MAX)
  @ValidateNested({ each: true })
  @Type(() => CaseFileInputDto)
  files?: CaseFileInputDto[];
}

export class TaskDoneDto {
  @ApiProperty()
  @IsBoolean()
  done!: boolean;
}

export class TaskItemIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  taskId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  itemId!: string;
}

export class TaskSubmissionDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'The checklist line these files answer.',
  })
  @IsOptional()
  @IsUUID('all')
  itemId?: string;

  @ApiPropertyOptional({ maxLength: NOTE_MAX })
  @IsOptional()
  @Transform(tidy)
  @IsString()
  @MaxLength(NOTE_MAX)
  note?: string;

  @ApiProperty({ type: [CaseFileInputDto], maxItems: FILES_PER_SEND_MAX })
  @IsArray()
  @ArrayMaxSize(FILES_PER_SEND_MAX)
  @ValidateNested({ each: true })
  @Type(() => CaseFileInputDto)
  files!: CaseFileInputDto[];
}

export class CreateCaseUpdateDto {
  @ApiProperty({ maxLength: UPDATE_TEXT_MAX })
  @Transform(tidy)
  @IsString()
  @MinLength(1)
  @MaxLength(UPDATE_TEXT_MAX)
  body!: string;

  @ApiProperty({ type: [CaseFileInputDto], maxItems: FILES_PER_SEND_MAX })
  @IsArray()
  @ArrayMaxSize(FILES_PER_SEND_MAX)
  @ValidateNested({ each: true })
  @Type(() => CaseFileInputDto)
  files!: CaseFileInputDto[];
}

export class CaseTaskIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  taskId!: string;
}

export class WorkspaceFileDto {
  @ApiProperty({ format: 'uuid' })
  fileId!: string;
  @ApiProperty()
  url!: string;
  @ApiProperty()
  previewUrl!: string;
  @ApiProperty()
  mime!: string;
  @ApiProperty({ type: 'integer' })
  sizeBytes!: number;
  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;
  @ApiProperty({ enum: ['case', 'task', 'update'] })
  source!: 'case' | 'task' | 'update';
  @ApiPropertyOptional({ type: String, nullable: true })
  sourceTitle!: string | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  sourceId!: string | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  sourceItemId!: string | null;
  @ApiProperty()
  sample!: boolean;
  @ApiProperty({ enum: ['client', 'attorney'] })
  addedByRole!: 'client' | 'attorney';
  @ApiProperty()
  addedAt!: string;
}

export class CaseTaskEventDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({
    enum: ['created', 'files_added', 'done', 'undone', 'closed', 'reopened'],
  })
  type!: string;
  @ApiProperty({ enum: ['client', 'attorney'] })
  actorRole!: 'client' | 'attorney';
  @ApiPropertyOptional({ type: String, nullable: true })
  note!: string | null;
  @ApiProperty({ type: 'integer' })
  fileCount!: number;
  @ApiProperty()
  at!: string;
}

export class CaseTaskItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  title!: string;
  @ApiProperty()
  done!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true })
  doneAt!: string | null;
  @ApiProperty({ type: [WorkspaceFileDto] })
  files!: WorkspaceFileDto[];
}

export class CaseTaskDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ enum: ['private', 'shared', 'for_client', 'joint'] })
  kind!: 'private' | 'shared' | 'for_client' | 'joint';
  @ApiProperty({ enum: ['client', 'attorney'] })
  createdByRole!: 'client' | 'attorney';
  @ApiProperty()
  title!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;
  @ApiProperty({ enum: ['open', 'done'] })
  status!: 'open' | 'done';
  @ApiPropertyOptional({ type: String, nullable: true })
  doneAt!: string | null;
  @ApiProperty()
  closed!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true })
  closedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  dueAt!: string | null;
  @ApiProperty()
  createdAt!: string;
  @ApiProperty({ type: 'integer' })
  fileCount!: number;
  @ApiProperty({ type: [WorkspaceFileDto] })
  files!: WorkspaceFileDto[];
  @ApiProperty({ type: [CaseTaskEventDto] })
  events!: CaseTaskEventDto[];
  @ApiProperty({ type: [CaseTaskItemDto] })
  items!: CaseTaskItemDto[];
  @ApiProperty({ type: 'integer' })
  itemsDone!: number;
  @ApiProperty({ type: 'integer' })
  itemsTotal!: number;
}

export class CaseTasksDto {
  @ApiProperty({ enum: ['client', 'attorney'] })
  role!: 'client' | 'attorney';
  @ApiProperty({ type: [CaseTaskDto] })
  forClient!: CaseTaskDto[];
  @ApiProperty({ type: [CaseTaskDto] })
  shared!: CaseTaskDto[];
  @ApiProperty({
    type: [CaseTaskDto],
    description: 'Tasks of both sides (either one ticks them).',
  })
  joint!: CaseTaskDto[];
  @ApiProperty({
    type: [CaseTaskDto],
    description: 'Attorney only; empty for the client.',
  })
  private!: CaseTaskDto[];
}

/// Owner 2026-10-15: one case task on the «Tasks» board (Mine), with its
/// case and the viewer's side.
export class BoardCaseTaskDto extends CaseTaskDto {
  @ApiProperty({ format: 'uuid' })
  caseId!: string;
  @ApiProperty()
  caseTitle!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  practiceCode!: string | null;
  @ApiProperty({ enum: ['client', 'attorney'] })
  viewerRole!: 'client' | 'attorney';
  @ApiProperty({
    description: 'The viewer may tick it (the rules of the case workspace).',
  })
  canTick!: boolean;
}

export class CaseUpdateDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ enum: ['client', 'attorney'] })
  authorRole!: 'client' | 'attorney';
  @ApiProperty()
  authorName!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  authorAvatarUrl!: string | null;
  @ApiProperty({
    type: [String],
    description: "The attorney's verified license states (the role line).",
  })
  authorStates!: string[];
  @ApiProperty()
  body!: string;
  @ApiProperty({ type: [WorkspaceFileDto] })
  files!: WorkspaceFileDto[];
  @ApiProperty()
  at!: string;
  @ApiProperty({
    enum: ['update', 'task_done', 'task_files'],
    description: 'Done tasks and file additions are entries of the feed too.',
  })
  kind!: 'update' | 'task_done' | 'task_files';
  @ApiPropertyOptional({ type: String, nullable: true })
  taskTitle!: string | null;
}

export class CaseWorkspaceDto {
  @ApiProperty({ enum: ['client', 'attorney'] })
  role!: 'client' | 'attorney';
  @ApiProperty({ type: [WorkspaceFileDto] })
  files!: WorkspaceFileDto[];
  @ApiProperty({ type: 'integer' })
  openTasks!: number;
  @ApiProperty({ type: 'integer' })
  updatesCount!: number;
  @ApiProperty()
  publishedAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  acceptedAt!: string | null;
  @ApiProperty({ type: 'integer' })
  bidsCount!: number;
  @ApiProperty({
    type: 'integer',
    description:
      "The other side's updates since this side last opened Updates.",
  })
  newUpdates!: number;
}

export class CaseActivityDto {
  @ApiProperty()
  id!: string;
  @ApiProperty({
    enum: [
      'update',
      'task_created',
      'task_done',
      'task_undone',
      'task_closed',
      'task_reopened',
      'files_added',
    ],
  })
  kind!: string;
  @ApiProperty({ enum: ['client', 'attorney'] })
  actorRole!: 'client' | 'attorney';
  @ApiProperty()
  actorName!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  text!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  taskTitle!: string | null;
  @ApiProperty({ type: 'integer' })
  fileCount!: number;
  @ApiProperty()
  at!: string;
}
