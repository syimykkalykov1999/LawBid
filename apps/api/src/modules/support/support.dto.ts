import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
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
}

export class AdminSupportMessageDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['user', 'admin'] }) authorType!: 'user' | 'admin';
  @ApiProperty({ format: 'uuid' }) authorId!: string;
  @ApiProperty() authorName!: string;
  @ApiProperty() internal!: boolean;
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
}
