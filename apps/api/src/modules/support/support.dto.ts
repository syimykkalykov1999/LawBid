import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  Max,
  Min,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const SUPPORT_CATEGORIES = [
  'account',
  'billing',
  'verification',
  'case',
  'bug',
  'abuse',
  'other',
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_STATUSES = [
  'open',
  'waiting_user',
  'resolved',
  'closed',
] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const SUPPORT_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export const SUPPORT_BODY_MAX = 5000;

// --- requests (app) -----------------------------------------------------------

export class CreateSupportTicketDto {
  @ApiProperty({ minLength: 3, maxLength: 200 })
  @Transform(trim)
  @IsString()
  @Length(3, 200)
  subject!: string;

  @ApiProperty({ enum: SUPPORT_CATEGORIES })
  @IsIn(SUPPORT_CATEGORIES)
  category!: SupportCategory;

  @ApiProperty({ minLength: 1, maxLength: SUPPORT_BODY_MAX })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(SUPPORT_BODY_MAX)
  body!: string;
}

export class SupportMessageBodyDto {
  @ApiProperty({ minLength: 1, maxLength: SUPPORT_BODY_MAX })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(SUPPORT_BODY_MAX)
  body!: string;
}

export class SupportCursorQueryDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

export class SupportTicketIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

// --- responses (app) ----------------------------------------------------------

export class SupportTicketDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() subject!: string;
  @ApiProperty({ enum: SUPPORT_CATEGORIES }) category!: SupportCategory;
  @ApiProperty({ enum: SUPPORT_STATUSES }) status!: SupportStatus;
  @ApiProperty({
    description: 'Support replied and the user has not opened it yet.',
  })
  unread!: boolean;
  @ApiProperty({ format: 'date-time' }) lastMessageAt!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  resolvedAt!: string | null;
  @ApiProperty({ description: 'false once the ticket is closed.' })
  canReply!: boolean;
}

export class SupportMessageDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['me', 'support'] }) author!: 'me' | 'support';
  @ApiPropertyOptional({
    nullable: true,
    description:
      '"LawBid Support" or "LawBid Support · <first name>" for support; null for own messages.',
  })
  authorName!: string | null;
  @ApiProperty() body!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class SupportTicketDetailDto extends SupportTicketDto {
  @ApiProperty({ type: SupportMessageDto, isArray: true })
  messages!: SupportMessageDto[];
}

// --- requests (admin) ---------------------------------------------------------

export class AdminSupportTicketsQueryDto extends SupportCursorQueryDto {
  @ApiPropertyOptional({ enum: SUPPORT_STATUSES })
  @IsOptional()
  @IsIn(SUPPORT_STATUSES)
  status?: SupportStatus;

  @ApiPropertyOptional({ enum: SUPPORT_CATEGORIES })
  @IsOptional()
  @IsIn(SUPPORT_CATEGORIES)
  category?: SupportCategory;

  @ApiPropertyOptional({ enum: SUPPORT_PRIORITIES })
  @IsOptional()
  @IsIn(SUPPORT_PRIORITIES)
  priority?: SupportPriority;

  @ApiPropertyOptional({
    description: '`me`, `unassigned` or an admin user id.',
  })
  @IsOptional()
  @IsString()
  @Matches(
    /^(me|unassigned|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
  )
  assignee?: string;

  @ApiPropertyOptional({ description: 'Substring of the subject.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  userId?: string;

  @ApiPropertyOptional({
    enum: ['breached', 'waiting'],
    description:
      'Owner 2026-10-05: `breached` = the answer is late (SLA missed); `waiting` = an answer is due (oldest deadline first).',
  })
  @IsOptional()
  @IsIn(['breached', 'waiting'])
  sla?: 'breached' | 'waiting';
}

export class AdminSupportReplyDto extends SupportMessageBodyDto {
  @ApiPropertyOptional({
    default: false,
    description: 'Internal note: visible to admins only, no notification.',
  })
  @IsOptional()
  @IsBoolean()
  internal?: boolean;

  @ApiPropertyOptional({
    enum: SUPPORT_STATUSES,
    description:
      'Status after a public reply (default waiting_user). Ignored for internal notes.',
  })
  @IsOptional()
  @IsIn(SUPPORT_STATUSES)
  status?: SupportStatus;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'The ready answer this reply was made from (counted).',
  })
  @IsOptional()
  @IsUUID('all')
  macroId?: string;
}

export class AdminUpdateSupportTicketDto {
  @ApiPropertyOptional({ enum: SUPPORT_STATUSES })
  @IsOptional()
  @IsIn(SUPPORT_STATUSES)
  status?: SupportStatus;

  @ApiPropertyOptional({ enum: SUPPORT_PRIORITIES })
  @IsOptional()
  @IsIn(SUPPORT_PRIORITIES)
  priority?: SupportPriority;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'An admin user id; null unassigns.',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID('all')
  assigneeId?: string | null;
}

// --- responses (admin) --------------------------------------------------------

export class AdminSupportUserRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) role!: string | null;
}

export class AdminSupportTicketRowDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() subject!: string;
  @ApiProperty({ enum: SUPPORT_CATEGORIES }) category!: SupportCategory;
  @ApiProperty({ enum: SUPPORT_STATUSES }) status!: SupportStatus;
  @ApiProperty({ enum: SUPPORT_PRIORITIES }) priority!: SupportPriority;
  @ApiProperty({ type: AdminSupportUserRefDto }) user!: AdminSupportUserRefDto;
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  assigneeId!: string | null;
  @ApiPropertyOptional({ nullable: true }) assigneeName!: string | null;
  @ApiProperty() unreadByAdmin!: boolean;
  @ApiProperty() unreadByUser!: boolean;
  @ApiProperty({ format: 'date-time' }) lastMessageAt!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  resolvedAt!: string | null;
  @ApiPropertyOptional({
    format: 'date-time',
    nullable: true,
    description:
      'Owner 2026-10-05: the answer is due by then (null = nothing due).',
  })
  slaDueAt?: string | null;
  @ApiPropertyOptional({
    description: 'The SLA was missed for the current wait.',
  })
  slaBreached?: boolean;
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  firstResponseAt?: string | null;
}

export class AdminSupportMessageDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['user', 'admin'] }) authorType!: 'user' | 'admin';
  @ApiProperty({ format: 'uuid' }) authorId!: string;
  @ApiProperty() authorName!: string;
  @ApiProperty() internal!: boolean;
  @ApiPropertyOptional({
    description: 'Owner 2026-10-05: an automatic answer (after hours).',
  })
  auto?: boolean;
  @ApiProperty() body!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AdminSupportUserSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) username!: string | null;
  @ApiPropertyOptional({ nullable: true }) role!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty() uiLanguage!: string;
  @ApiProperty({
    description:
      'Has a verified email (the address itself: GET /admin/users/:id/contacts with X-Justification).',
  })
  hasEmail!: boolean;
  @ApiProperty({ description: 'Has a verified phone (see hasEmail).' })
  hasPhone!: boolean;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Attorneys only (SubscriptionAccessService); null otherwise.',
  })
  subscriptionActive!: boolean | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AdminSupportTicketDetailDto extends AdminSupportTicketRowDto {
  @ApiProperty({ type: AdminSupportUserSummaryDto })
  userSummary!: AdminSupportUserSummaryDto;
  @ApiProperty({ type: AdminSupportMessageDto, isArray: true })
  messages!: AdminSupportMessageDto[];
}

export class AdminSupportStatusCountsDto {
  @ApiProperty() open!: number;
  @ApiProperty() waiting_user!: number;
  @ApiProperty() resolved!: number;
  @ApiProperty() closed!: number;
}

export class AdminSupportStatsDto {
  @ApiProperty({ type: AdminSupportStatusCountsDto })
  byStatus!: AdminSupportStatusCountsDto;
  @ApiProperty({ description: 'Open tickets nobody is assigned to.' })
  openUnassigned!: number;
  @ApiProperty({
    description: 'Not-closed tickets with an unread user message.',
  })
  unreadByAdmin!: number;
  @ApiProperty({
    description: 'openUnassigned + unreadByAdmin (dashboard badge).',
  })
  attention!: number;
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Average minutes to the first public admin reply, tickets created in the last 30 days (null = no data).',
  })
  avgFirstResponseMinutes30d!: number | null;
  @ApiPropertyOptional({
    description: 'Owner 2026-10-05: tickets whose answer is late right now.',
  })
  slaBreached?: number;
  @ApiPropertyOptional({ description: 'Support agents on shift now.' })
  onShift?: number;
  @ApiPropertyOptional({
    description: 'The team works now (24/7 or within the hours).',
  })
  openNow?: boolean;
}

// --- support desk (owner 2026-10-05: support 24/7) ----------------------------

export class SupportInfoDto {
  @ApiProperty({ description: 'The team works now.' }) open!: boolean;
  @ApiProperty() alwaysOpen!: boolean;
  @ApiProperty({ description: 'Usual first answer time, minutes.' })
  expectedReplyMinutes!: number;
  @ApiPropertyOptional({
    format: 'date-time',
    nullable: true,
    description: 'When the team is back (null while open).',
  })
  opensAt!: string | null;
}

export class SupportDeskSettingsDto {
  @ApiProperty({
    description: 'New tickets go to agents on shift by themselves.',
  })
  autoAssign!: boolean;
  @ApiProperty({ minimum: 5, maximum: 2880 }) slaFirstResponseMinutes!: number;
  @ApiProperty({
    minimum: 5,
    maximum: 2880,
    description: 'High and urgent tickets.',
  })
  slaUrgentMinutes!: number;
  @ApiProperty({
    description: 'Tell the team (e-mail) when an answer is late.',
  })
  slaAlerts!: boolean;
  @ApiProperty({ description: 'A late ticket goes one priority up.' })
  escalateOnBreach!: boolean;
  @ApiProperty({ description: '24/7; off = the hours below.' })
  alwaysOpen!: boolean;
  @ApiProperty({
    type: Number,
    isArray: true,
    description: '1 = Monday … 7 = Sunday.',
  })
  openDays!: number[];
  @ApiProperty({ minimum: 0, maximum: 23 }) openFromHour!: number;
  @ApiProperty({ minimum: 1, maximum: 24 }) openToHour!: number;
  @ApiProperty({ example: 'America/Chicago' }) timeZone!: string;
  @ApiProperty({ description: 'Answer automatically outside the hours.' })
  autoReply!: boolean;
  @ApiProperty({
    minimum: 0,
    maximum: 90,
    description: 'Resolved → closed after N days (0 = never).',
  })
  autoCloseResolvedDays!: number;
}

export class UpdateSupportDeskSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoAssign?: boolean;
  @ApiPropertyOptional({ minimum: 5, maximum: 2880 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(2880)
  slaFirstResponseMinutes?: number;
  @ApiPropertyOptional({ minimum: 5, maximum: 2880 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(2880)
  slaUrgentMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() slaAlerts?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() escalateOnBreach?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() alwaysOpen?: boolean;
  @ApiPropertyOptional({ type: Number, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  openDays?: number[];
  @ApiPropertyOptional({ minimum: 0, maximum: 23 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  openFromHour?: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 24 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  openToHour?: number;
  @ApiPropertyOptional({ example: 'America/Chicago' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timeZone?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoReply?: boolean;
  @ApiPropertyOptional({ minimum: 0, maximum: 90 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(90)
  autoCloseResolvedDays?: number;
}

export class SupportMacroDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ description: '`{name}` becomes the user first name.' })
  body!: string;
  @ApiPropertyOptional({ enum: SUPPORT_CATEGORIES, nullable: true })
  category!: SupportCategory | null;
  @ApiProperty() active!: boolean;
  @ApiProperty() uses!: number;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class CreateSupportMacroDto {
  @ApiProperty({ minLength: 1, maxLength: 120 })
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  title!: string;

  @ApiProperty({ minLength: 1, maxLength: SUPPORT_BODY_MAX })
  @Transform(trim)
  @IsString()
  @Length(1, SUPPORT_BODY_MAX)
  body!: string;

  @ApiPropertyOptional({ enum: SUPPORT_CATEGORIES, nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsIn(SUPPORT_CATEGORIES)
  category?: SupportCategory | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateSupportMacroDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  title?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: SUPPORT_BODY_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, SUPPORT_BODY_MAX)
  body?: string;

  @ApiPropertyOptional({ enum: SUPPORT_CATEGORIES, nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsIn(SUPPORT_CATEGORIES)
  category?: SupportCategory | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class SupportMacroIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class SupportAgentDto {
  @ApiProperty({ format: 'uuid' }) adminId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() onShift!: boolean;
  @ApiProperty({
    description: 'Auto-assignment skips the agent at this many open tickets.',
  })
  maxOpen!: number;
  @ApiProperty({ description: 'Open tickets assigned now.' })
  openTickets!: number;
}

export class UpdateSupportAgentDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() onShift?: boolean;
  @ApiPropertyOptional({ minimum: 1, maximum: 500 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxOpen?: number;
}

export class SupportAgentIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  adminId!: string;
}

export class SupportStaffStatsQueryDto {
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class SupportStaffStatsDto {
  @ApiProperty({ format: 'uuid' }) adminId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Public answers written.' }) replies!: number;
  @ApiProperty({ description: 'Tickets answered first by this agent.' })
  firstResponses!: number;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Median minutes to their first answers.',
  })
  medianFirstResponseMinutes!: number | null;
  @ApiProperty({ description: 'Tickets this agent resolved or closed.' })
  resolved!: number;
  @ApiProperty({ description: 'Their tickets whose answer was late.' })
  slaBreaches!: number;
  @ApiProperty({ description: 'Open tickets assigned now.' }) openNow!: number;
  @ApiProperty() onShift!: boolean;
}

export class SupportNextTicketDto {
  @ApiPropertyOptional({
    type: AdminSupportTicketDetailDto,
    nullable: true,
    description: 'null = the queue is empty.',
  })
  ticket!: AdminSupportTicketDetailDto | null;
}

export class SupportMacrosQueryDto {
  @ApiPropertyOptional({
    description: 'Include switched-off answers (management).',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  all?: boolean;
}
