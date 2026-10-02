import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ASSISTANT_DUTIES, type AssistantDuty } from './assistant-duties';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const PHONE = /^\+[1-9][0-9]{7,14}$/;

/** Audit 2026-10-01: a contact phone typed as "312 555 0123",
 * "(312) 555-0123" or "1-312-555-0123" is stored as +13125550123 (a US
 * 10-digit number gets +1); anything else is validated as typed. */
export function normalizeContactPhone({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  const raw = value.trim();
  if (raw === '') return raw;
  const digits = raw.replace(/[^0-9]/g, '');
  if (raw.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw;
}

export class AssistantPhoneDto {
  @ApiProperty({ example: '+13125550111' })
  @Matches(PHONE)
  phone!: string;
}

export class JoinVerifyDto {
  @ApiProperty({
    example: '+13125550101',
    description: "The attorney's phone.",
  })
  @Matches(PHONE)
  attorneyPhone!: string;

  @ApiProperty({ example: '000000' })
  @Matches(/^[0-9]{6}$/)
  code!: string;
}

export class AddAssistantDto {
  @ApiProperty({ example: '+13125550111' })
  @Matches(PHONE)
  phone!: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ enum: ASSISTANT_DUTIES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(ASSISTANT_DUTIES, { each: true })
  duties?: AssistantDuty[];
  @ApiPropertyOptional({
    description:
      'OQ-049: required (true) when granting "bids" or "publish" — the attorney accepts full responsibility for the assistant\'s bids, negotiations and publications.',
  })
  @IsOptional()
  @IsBoolean()
  acceptLiability?: boolean;
}

export class UpdateAssistantDto {
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ enum: ASSISTANT_DUTIES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(ASSISTANT_DUTIES, { each: true })
  duties?: AssistantDuty[];
  @ApiPropertyOptional({
    description:
      'OQ-049: required (true) when granting "bids" or "publish" — the attorney accepts full responsibility for the assistant\'s bids, negotiations and publications.',
  })
  @IsOptional()
  @IsBoolean()
  acceptLiability?: boolean;
}

export class AssistantIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class AssistantMemberDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() phone!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) name!: string | null;
  @ApiProperty({ enum: ['invited', 'active', 'removed'] })
  status!: 'invited' | 'active' | 'removed';
  @ApiProperty({ enum: ['purchase', 'attorney_added', 'attorney_otp'] })
  approval!: 'purchase' | 'attorney_added' | 'attorney_otp';
  @ApiProperty({ type: [String] }) duties!: string[];
  @ApiPropertyOptional({ type: String, nullable: true }) joinedAt!:
    string | null;
  @ApiProperty() createdAt!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'OQ-049: when the attorney last accepted responsibility for this assistant ("bids" / "publish").',
  })
  liabilityAcceptedAt!: string | null;
}

export class TeamDto {
  @ApiProperty({ type: [AssistantMemberDto] }) members!: AssistantMemberDto[];
  @ApiProperty({ type: 'integer' }) seats!: number;
  @ApiProperty({ type: 'integer' }) used!: number;
  @ApiProperty({ enum: ['monthly', 'yearly', 'none'] })
  plan!: 'monthly' | 'yearly' | 'none';
}

/** What the assistant app needs about itself. */
export class AssistantMeDto {
  /** Audit 2026-10-02: `paused` = joined, but the attorney's subscription
   * lapsed (the assistant can't work in the account until it's renewed). */
  @ApiProperty({ enum: ['none', 'invited', 'active', 'paused'] })
  state!: 'none' | 'invited' | 'active' | 'paused';
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  membershipId!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description: "The attorney's user id (the account the assistant acts in).",
  })
  attorneyId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  attorneyName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  attorneyUsername!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  attorneyAvatarUrl!: string | null;
  @ApiProperty({ type: [String] }) duties!: string[];
}

export class ActivityDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) membershipId!: string;
  @ApiProperty() assistantName!: string;
  @ApiProperty() action!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) targetType!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) targetId!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) summary!:
    string | null;
  @ApiProperty() createdAt!: string;
}

export class ActivityQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  membershipId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

export const REQUEST_KINDS = [
  'post',
  'comment',
  'case_comment',
  'profile_edit',
] as const;

export class CreateAssistantRequestDto {
  @ApiProperty({ enum: REQUEST_KINDS, enumName: 'AssistantRequestKind' })
  @IsIn(REQUEST_KINDS)
  kind!: (typeof REQUEST_KINDS)[number];

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'post: {title, body, practiceCode, kind, mediaFileIds}; comment: {postId, body, parentId?}; case_comment: {caseId, body}; profile_edit: {bio?, firmName?, languages?}',
  })
  @IsObject()
  payload!: Record<string, unknown>;
}

export class AssistantRequestDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) membershipId!: string;
  @ApiProperty() assistantName!: string;
  @ApiProperty({ enum: REQUEST_KINDS, enumName: 'AssistantRequestKind' })
  kind!: (typeof REQUEST_KINDS)[number];
  @ApiProperty({ type: 'object', additionalProperties: true })
  payload!: Record<string, unknown>;
  @ApiProperty({
    enum: ['pending', 'approved', 'rejected'],
    enumName: 'AssistantRequestStatus',
  })
  status!: 'pending' | 'approved' | 'rejected';
  @ApiPropertyOptional({ type: String, nullable: true }) resultId!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({
    type: [String],
    description: 'Post requests: preview links of the attached photos.',
  })
  mediaUrls!: string[];
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Post requests: the qualification name (English).',
  })
  practiceName!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) decidedAt!:
    string | null;
}

export class RequestsQueryDto {
  @ApiPropertyOptional({
    enum: ['pending', 'approved', 'rejected'],
    enumName: 'AssistantRequestStatus',
  })
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: 'pending' | 'approved' | 'rejected';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

export class DecideRequestDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string;
}

// --- Tasks ---------------------------------------------------------------

export const TASK_KINDS = [
  'call',
  'meeting',
  'court',
  'deadline',
  'documents',
  'print',
  'visit',
  'other',
  // Owner 2026-10-01: everything an attorney plans.
  'consultation',
  'hearing_prep',
  'deposition',
  'mediation',
  'filing',
  'review',
  'email',
  'sign',
  'payment',
  'research',
  'jail_visit',
] as const;
export const TASK_STATUSES = [
  'open',
  'taken',
  'done',
  'not_done',
  'cancelled',
] as const;

/** Owner 2026-10-01: one checklist step inside a task. */
export class TaskStepInputDto {
  @ApiPropertyOptional({ enum: TASK_KINDS, enumName: 'AttorneyTaskKind' })
  @IsOptional()
  @IsIn(TASK_KINDS)
  kind?: (typeof TASK_KINDS)[number];

  @ApiProperty({ minLength: 1, maxLength: 160 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @ApiPropertyOptional({ example: '+13125550123' })
  @IsOptional()
  @Transform(normalizeContactPhone)
  @Matches(PHONE)
  contactPhone?: string;

  @ApiPropertyOptional({ maxLength: 254 })
  @IsOptional()
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  contactEmail?: string;
}

export class UpdateTaskStepDto {
  @ApiPropertyOptional({
    enum: ['open', 'done', 'not_done'],
    enumName: 'TaskStepStatus',
  })
  @IsOptional()
  @IsIn(['open', 'done', 'not_done'])
  status?: 'open' | 'done' | 'not_done';

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  note?: string;

  /** Move the step to another time (attorney or assistant). */
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601()
  dueAt?: string;
}

export class TaskStepDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() position!: number;
  @ApiPropertyOptional({
    enum: TASK_KINDS,
    enumName: 'AttorneyTaskKind',
    nullable: true,
  })
  kind!: (typeof TASK_KINDS)[number] | null;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) dueAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) location!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) contactName!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) contactPhone!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) contactEmail!:
    string | null;
  @ApiProperty({ enum: TASK_STATUSES, enumName: 'AttorneyTaskStatus' })
  status!: (typeof TASK_STATUSES)[number];
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) doneAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) createdByName!:
    string | null;
}

export class CreateTaskDto {
  @ApiProperty({ enum: TASK_KINDS, enumName: 'AttorneyTaskKind' })
  @IsIn(TASK_KINDS)
  kind!: (typeof TASK_KINDS)[number];

  @ApiProperty({ minLength: 1, maxLength: 160 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  caseId?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @ApiPropertyOptional({ example: '+13125550123' })
  @IsOptional()
  @Transform(normalizeContactPhone)
  @Matches(PHONE)
  contactPhone?: string;

  @ApiPropertyOptional({
    maxLength: 254,
    description: 'Email tasks: the address.',
  })
  @IsOptional()
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  contactEmail?: string;

  // Owner 2026-10-01: practically unlimited (a technical cap only).
  @ApiPropertyOptional({ type: [String], maxItems: 200 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  fileIds?: string[];

  /** Owner 2026-10-01: a checklist — as many steps as needed. */
  @ApiPropertyOptional({ type: [TaskStepInputDto], maxItems: 100 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TaskStepInputDto)
  steps?: TaskStepInputDto[];
}

/** Owner 2026-10-01: edit a task (any field; "" clears an optional one). */
export class UpdateTaskDto {
  @ApiPropertyOptional({ enum: TASK_KINDS, enumName: 'AttorneyTaskKind' })
  @IsOptional()
  @IsIn(TASK_KINDS)
  kind?: (typeof TASK_KINDS)[number];

  @ApiPropertyOptional({ minLength: 1, maxLength: 160 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  /** true removes the time. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  clearDueAt?: boolean;

  @ApiPropertyOptional({ format: 'uuid', description: 'Link another case.' })
  @IsOptional()
  @IsUUID('all')
  caseId?: string;

  @ApiPropertyOptional({ description: 'Unlink the case.' })
  @IsOptional()
  @IsBoolean()
  clearCaseId?: boolean;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @ApiPropertyOptional({ example: '+13125550123' })
  @IsOptional()
  @Transform(normalizeContactPhone)
  @Matches(/^(\+[1-9]\d{7,14})?$/)
  contactPhone?: string;

  @ApiPropertyOptional({ maxLength: 254 })
  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, v) => v !== '')
  @IsEmail()
  @MaxLength(254)
  contactEmail?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 200 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  fileIds?: string[];
}

export class UpdateTaskStatusDto {
  @ApiProperty({ enum: ['taken', 'done', 'not_done', 'cancelled', 'open'] })
  @IsIn(['taken', 'done', 'not_done', 'cancelled', 'open'])
  status!: 'taken' | 'done' | 'not_done' | 'cancelled' | 'open';

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  outcomeNote?: string;

  /** not_done: move it to this moment (stays open there). */
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  rescheduleTo?: string;
}

export class TaskFileDto {
  @ApiProperty({ format: 'uuid' }) fileId!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) url!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) mime!: string | null;
}

export class TaskDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: TASK_KINDS, enumName: 'AttorneyTaskKind' })
  kind!: (typeof TASK_KINDS)[number];
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) notes!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) dueAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) location!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) caseId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) caseTitle!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) contactName!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) contactPhone!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) contactEmail!:
    string | null;
  @ApiProperty({ type: [TaskFileDto] }) files!: TaskFileDto[];
  @ApiProperty({ enum: TASK_STATUSES, enumName: 'AttorneyTaskStatus' })
  status!: (typeof TASK_STATUSES)[number];
  @ApiPropertyOptional({ type: String, nullable: true }) outcomeNote!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) rescheduledTo!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) createdByName!:
    string | null;
  @ApiProperty({ description: 'The viewer may delete this task.' })
  canDelete!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) doneAt!: string | null;
  @ApiProperty({ type: [TaskStepDto] }) steps!: TaskStepDto[];
}

export class TasksQueryDto {
  @ApiPropertyOptional({
    enum: ['active', 'done', 'all'],
    enumName: 'TasksView',
    default: 'active',
  })
  @IsOptional()
  @IsIn(['active', 'done', 'all'])
  view?: 'active' | 'done' | 'all';

  @ApiPropertyOptional({
    description: 'Assistant: only the tasks they set (their Results).',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  mine?: boolean;

  @ApiPropertyOptional({
    format: 'date',
    description: 'From this day (YYYY-MM-DD).',
  })
  @IsOptional()
  @Length(10, 10)
  from?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @Length(10, 10)
  to?: string;
}

export class TaskStepParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  stepId!: string;
}
