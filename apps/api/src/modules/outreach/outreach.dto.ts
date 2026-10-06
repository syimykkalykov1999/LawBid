import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  ACTIVITY_KINDS,
  CALL_OUTCOMES,
  LEAD_KINDS,
  LEAD_SOURCES,
  LEAD_STATUSES,
  MAX_DAILY_EMAILS,
  OUTREACH_LIMITS,
  OUTREACH_TEXT_LIMITS,
  TEMPLATE_KINDS,
  type ActivityKind,
  type CallOutcome,
  type ContactBlockReason,
  type LeadKind,
  type LeadSource,
  type LeadStatus,
  type TemplateKind,
} from './outreach.settings';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
/** Trims and drops trailing slashes, so `https://api.lawbid.dev/` is accepted. */
const trimUrl = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\/+$/, '') : value;
const emptyToNull = ({ value }: { value: unknown }) =>
  value === '' ? null : value;
const toInt = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value !== '' ? Number(value) : value;

export class OutreachPartnerDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ nullable: true, type: String }) name!: string | null;
  @ApiProperty({ nullable: true, type: String }) label!: string | null;
  @ApiProperty({ description: 'The partner referral code (their link).' })
  code!: string;
  @ApiProperty() status!: string;
}

export class OutreachActivityDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ACTIVITY_KINDS, enumName: 'OutreachActivityKind' })
  kind!: ActivityKind;
  @ApiProperty({ nullable: true, type: String }) outcome!: string | null;
  @ApiProperty({ nullable: true, type: String }) body!: string | null;
  @ApiProperty({ nullable: true, format: 'uuid', type: String })
  partnerId!: string | null;
  @ApiProperty({ nullable: true, format: 'uuid', type: String })
  actorAdminId!: string | null;
  @ApiProperty({ nullable: true, type: String })
  actorName!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class OutreachLeadRowDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: LEAD_KINDS, enumName: 'OutreachLeadKind' })
  kind!: LeadKind;
  @ApiProperty({ nullable: true, type: String }) firstName!: string | null;
  @ApiProperty({ nullable: true, type: String }) lastName!: string | null;
  @ApiProperty({ nullable: true, type: String }) company!: string | null;
  @ApiProperty({ nullable: true, type: String }) stateCode!: string | null;
  @ApiProperty({ nullable: true, type: String }) city!: string | null;
  @ApiProperty({ nullable: true, type: String }) practice!: string | null;
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ nullable: true, type: String }) email!: string | null;
  @ApiProperty({ enum: LEAD_SOURCES, enumName: 'OutreachLeadSource' })
  source!: LeadSource;
  @ApiProperty({ enum: LEAD_STATUSES, enumName: 'OutreachLeadStatus' })
  status!: LeadStatus;
  @ApiProperty({ nullable: true, type: OutreachPartnerDto })
  partner!: OutreachPartnerDto | null;
  @ApiProperty({ nullable: true, format: 'uuid', type: String })
  convertedUserId!: string | null;
  @ApiProperty() unsubscribed!: boolean;
  @ApiProperty({ nullable: true, format: 'date-time', type: String })
  lastActivityAt!: string | null;
  @ApiProperty({ nullable: true, format: 'date-time', type: String })
  nextActionAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) note!: string | null;
  @ApiProperty({
    description:
      'Do-not-contact (TCPA / DNC): phone and email are hidden, no calls or emails.',
  })
  doNotContact!: boolean;
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'manual | not_interested | wrong_number | unsubscribed | suppression | retention',
  })
  doNotContactReason!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Where the contact came from and on what basis we may write.',
  })
  sourceNote!: string | null;
  @ApiProperty({ description: 'Cold emails sent to this lead so far.' })
  emailsSent!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export const CONTACT_BLOCK_REASONS = [
  'dnc',
  'client_disabled',
  'hours',
  'unsubscribed',
  'email_limit',
  'email_cooldown',
] as const;

export class OutreachLeadDetailDto extends OutreachLeadRowDto {
  @ApiProperty({ type: [OutreachActivityDto] })
  activities!: OutreachActivityDto[];
  @ApiProperty({
    description:
      'Cold emails this lead may still receive (emailBlocked === null).',
  })
  canEmail!: boolean;
  @ApiProperty({
    description:
      'A call may be logged now (not do-not-contact, clients enabled, inside the local call window).',
  })
  callAllowed!: boolean;
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'The local call window and time, e.g. "08:00–21:00 America/New_York, now 22:15".',
  })
  callWindow!: string | null;
  @ApiProperty({
    nullable: true,
    enum: CONTACT_BLOCK_REASONS,
    enumName: 'OutreachContactBlockReason',
    description: 'Why a call is blocked now; null = allowed.',
  })
  callBlocked!: ContactBlockReason | null;
  @ApiProperty({
    nullable: true,
    enum: CONTACT_BLOCK_REASONS,
    enumName: 'OutreachContactBlockReason',
    description: 'Why an email is blocked now; null = allowed.',
  })
  emailBlocked!: ContactBlockReason | null;
  @ApiProperty({
    description:
      'A phone exists but is withheld (callBlocked / do-not-contact).',
  })
  phoneHidden!: boolean;
}

export class OutreachLeadIdParamDto {
  @IsUUID() id!: string;
}

export class OutreachLeadsQueryDto {
  @ApiPropertyOptional({ enum: LEAD_STATUSES, enumName: 'OutreachLeadStatus' })
  @IsOptional()
  @IsIn(LEAD_STATUSES)
  status?: LeadStatus;

  @ApiPropertyOptional({ enum: LEAD_KINDS, enumName: 'OutreachLeadKind' })
  @IsOptional()
  @IsIn(LEAD_KINDS)
  kind?: LeadKind;

  @ApiPropertyOptional({ format: 'uuid', description: 'Assigned partner.' })
  @IsOptional()
  @IsUUID()
  partnerId?: string;

  @ApiPropertyOptional({
    enum: ['none'],
    enumName: 'OutreachAssignedFilter',
    description: '"none" = unassigned leads only.',
  })
  @IsOptional()
  @IsIn(['none'])
  assigned?: 'none';

  @ApiPropertyOptional({ maxLength: 2 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2)
  state?: string;

  @ApiPropertyOptional({ description: 'Name, company, email or phone.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({
    enum: ['true'],
    enumName: 'OutreachDueFilter',
    description: 'Leads due for a follow-up by now.',
  })
  @IsOptional()
  @IsIn(['true'])
  due?: 'true';

  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
}

export class OutreachLeadInputDto {
  @ApiPropertyOptional({ enum: LEAD_KINDS, enumName: 'OutreachLeadKind' })
  @IsOptional()
  @IsIn(LEAD_KINDS)
  kind?: LeadKind;

  @ApiPropertyOptional({ nullable: true, maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(80)
  firstName?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(80)
  lastName?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 160 })
  @IsOptional()
  @Transform(trim)
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(160)
  company?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 2 })
  @IsOptional()
  @Transform(trim)
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2)
  stateCode?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(80)
  city?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(80)
  practice?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 32 })
  @IsOptional()
  @Transform(trim)
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 254 })
  @IsOptional()
  @Transform(trim)
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(254)
  email?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  note?: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsISO8601()
  nextActionAt?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    format: 'uuid',
    description: 'Assigned partner (employee); null = unassigned.',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  partnerId?: string | null;

  @ApiPropertyOptional({
    enum: LEAD_STATUSES,
    enumName: 'OutreachLeadStatus',
    description: 'Manual status; registered/paid are set by the system.',
  })
  @IsOptional()
  @IsIn(LEAD_STATUSES)
  status?: LeadStatus;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: OUTREACH_TEXT_LIMITS.sourceNote,
    description:
      'Where the contact came from and on what basis we may write; required for client leads.',
  })
  @IsOptional()
  @Transform(trim)
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(OUTREACH_TEXT_LIMITS.sourceNote)
  sourceNote?: string | null;

  @ApiPropertyOptional({
    description:
      'true = mark do-not-contact (reason manual); false clears it (managers only).',
  })
  @IsOptional()
  @IsBoolean()
  doNotContact?: boolean;
}

export class OutreachAssignDto {
  @ApiProperty({ type: [String], format: 'uuid', maxItems: 500 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  leadIds!: string[];

  @ApiProperty({ nullable: true, format: 'uuid', type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  partnerId!: string | null;
}

export class OutreachAssignResultDto {
  @ApiProperty() updated!: number;
}

export class OutreachActivityInputDto {
  @ApiProperty({
    enum: ['call', 'note'],
    enumName: 'OutreachActivityInputKind',
  })
  @IsIn(['call', 'note'])
  kind!: 'call' | 'note';

  @ApiPropertyOptional({ enum: CALL_OUTCOMES, enumName: 'OutreachCallOutcome' })
  @IsOptional()
  @IsIn(CALL_OUTCOMES)
  outcome?: CallOutcome;

  @ApiPropertyOptional({ nullable: true, maxLength: 4000 })
  @IsOptional()
  @Transform(trim)
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(4000)
  body?: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsISO8601()
  nextActionAt?: string | null;
}

export class OutreachSendEmailDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() templateId!: string;
}

export class OutreachSendEmailResultDto {
  @ApiProperty() subject!: string;
  @ApiProperty({ description: "Emails left in this employee's daily budget." })
  remainingToday!: number;
}

export class OutreachImportQueryDto {
  @ApiPropertyOptional({
    enum: ['dry-run', 'apply'],
    enumName: 'OutreachImportMode',
    default: 'dry-run',
  })
  @IsOptional()
  @IsIn(['dry-run', 'apply'])
  mode?: 'dry-run' | 'apply';

  @ApiPropertyOptional({
    enum: LEAD_KINDS,
    enumName: 'OutreachLeadKind',
    default: 'attorney',
  })
  @IsOptional()
  @IsIn(LEAD_KINDS)
  kind?: LeadKind;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Assign every new lead to this partner.',
  })
  @IsOptional()
  @IsUUID()
  partnerId?: string;

  @ApiPropertyOptional({
    minLength: 3,
    maxLength: OUTREACH_TEXT_LIMITS.sourceNote,
    description:
      'Required for CSV: where the contacts come from and on what basis we may write; stored on every lead.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(OUTREACH_TEXT_LIMITS.sourceNote)
  sourceNote?: string;
}

export class OutreachImportReportDto {
  @ApiProperty() mode!: 'dry-run' | 'apply';
  @ApiProperty({ description: 'Rows that are leads (have an email or phone).' })
  rows!: number;
  @ApiProperty({ description: 'Would be / were created.' }) created!: number;
  @ApiProperty({ description: 'Email or phone already in the base.' })
  duplicates!: number;
  @ApiProperty({ description: 'Email or phone on the stop-list; not created.' })
  suppressed!: number;
  @ApiProperty({ description: 'Rows without any contact.' }) skipped!: number;
  @ApiProperty({ type: [String] }) columns!: string[];
  @ApiProperty({
    type: [String],
    description: 'First few problems, "row 12: no_contact".',
  })
  problems!: string[];
}

export class OutreachRegistryImportDto {
  @ApiProperty({
    enum: ['NY'],
    enumName: 'OutreachRegistryState',
    description: 'Only New York publishes a free registry so far.',
  })
  @IsIn(['NY'])
  state!: 'NY';

  @ApiPropertyOptional({
    maxLength: 40,
    description: 'County, e.g. "New York", "Kings".',
  })
  @IsOptional()
  @Transform(trim)
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(40)
  county?: string | null;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(80)
  city?: string | null;

  @ApiPropertyOptional({
    minimum: 1950,
    maximum: 2100,
    description: 'Admitted in or after this year.',
  })
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1950)
  @Max(2100)
  admittedFrom?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 500, default: 100 })
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiPropertyOptional({
    minimum: 0,
    default: 0,
    description: 'Skip this many rows (next page).',
  })
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  offset?: number;

  @ApiPropertyOptional({
    enum: ['dry-run', 'apply'],
    enumName: 'OutreachImportMode',
    default: 'dry-run',
  })
  @IsOptional()
  @IsIn(['dry-run', 'apply'])
  mode?: 'dry-run' | 'apply';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  partnerId?: string | null;
}

export class OutreachTemplateDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: TEMPLATE_KINDS, enumName: 'OutreachTemplateKind' })
  kind!: TemplateKind;
  @ApiProperty() subject!: string;
  @ApiProperty() body!: string;
  @ApiProperty() active!: boolean;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class OutreachTemplateInputDto {
  @ApiProperty({ maxLength: 80 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({
    enum: TEMPLATE_KINDS,
    enumName: 'OutreachTemplateKind',
    default: 'any',
  })
  @IsOptional()
  @IsIn(TEMPLATE_KINDS)
  kind?: TemplateKind;

  @ApiProperty({ maxLength: 200 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  subject!: string;

  @ApiProperty({
    maxLength: 8000,
    description:
      'Plain text; {{first_name}} {{last_name}} {{company}} {{sender_name}} {{link}}.',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(8000)
  body!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class OutreachTemplateIdParamDto {
  @IsUUID() id!: string;
}

export class OutreachSettingsDto {
  @ApiProperty({ minimum: 0, maximum: MAX_DAILY_EMAILS })
  @IsInt()
  @Min(0)
  @Max(MAX_DAILY_EMAILS)
  dailyEmailLimit!: number;

  @ApiProperty({ maxLength: OUTREACH_TEXT_LIMITS.fromName })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(OUTREACH_TEXT_LIMITS.fromName)
  fromName!: string;

  @ApiProperty({
    maxLength: OUTREACH_TEXT_LIMITS.footerAddress,
    description: 'CAN-SPAM postal address printed in every cold email.',
  })
  @Transform(trim)
  @IsString()
  @MaxLength(OUTREACH_TEXT_LIMITS.footerAddress)
  footerAddress!: string;

  @ApiProperty({
    maxLength: OUTREACH_TEXT_LIMITS.apiPublicUrl,
    description:
      'Public https base of the API for unsubscribe links, e.g. https://api.lawbid.dev.',
  })
  @Transform(trimUrl)
  @IsString()
  @MaxLength(OUTREACH_TEXT_LIMITS.apiPublicUrl)
  @Matches(/^(https:\/\/[a-z0-9.-]+(:\d+)?(\/[\w./-]*[\w-])?)?$/i, {
    message: 'apiPublicUrl must be an https URL (host, optional port and path)',
  })
  apiPublicUrl!: string;

  // Owner 2026-10-05 (legal): TCPA / Do-Not-Call protection.
  // Optional on PUT (omitted = keep the stored value) so older admin
  // builds keep working.
  @ApiPropertyOptional({
    description:
      'Allow client (consumer) leads; requires dncConfirmed. Off by default.',
  })
  @IsBoolean()
  @IsOptional()
  clientLeadsEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Consumer numbers are scrubbed against the National Do-Not-Call registry.',
  })
  @IsBoolean()
  @IsOptional()
  dncConfirmed?: boolean;

  @ApiPropertyOptional({
    maxLength: OUTREACH_TEXT_LIMITS.dncSan,
    description: 'DNC registry Subscription Account Number (informational).',
  })
  @Transform(trim)
  @IsString()
  @MaxLength(OUTREACH_TEXT_LIMITS.dncSan)
  @IsOptional()
  dncSan?: string;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 23,
    description: "Calls allowed from this local hour of the lead's state.",
  })
  @IsInt()
  @Min(0)
  @Max(23)
  @IsOptional()
  callHoursStart?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 24,
    description: 'Calls allowed until this local hour (exclusive); > start.',
  })
  @IsInt()
  @Min(1)
  @Max(24)
  @IsOptional()
  callHoursEnd?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: OUTREACH_LIMITS.maxEmailsPerLead,
    description: 'Cold emails one lead may receive in total; 0 = no cap.',
  })
  @IsInt()
  @Min(0)
  @Max(OUTREACH_LIMITS.maxEmailsPerLead)
  @IsOptional()
  maxEmailsPerLead?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: OUTREACH_LIMITS.emailCooldownDays,
    description: 'Days between two cold emails to the same lead.',
  })
  @IsInt()
  @Min(0)
  @Max(OUTREACH_LIMITS.emailCooldownDays)
  @IsOptional()
  emailCooldownDays?: number;

  @ApiPropertyOptional({
    minimum: OUTREACH_LIMITS.leadRetentionDaysMin,
    maximum: OUTREACH_LIMITS.leadRetentionDaysMax,
    description:
      'Unconverted leads with no activity for this long are deleted daily.',
  })
  @IsInt()
  @Min(OUTREACH_LIMITS.leadRetentionDaysMin)
  @Max(OUTREACH_LIMITS.leadRetentionDaysMax)
  @IsOptional()
  leadRetentionDays?: number;
}

// Owner 2026-10-05 (legal): the stop-list (managers only).
export class OutreachSuppressionsAddDto {
  @ApiProperty({
    type: [String],
    maxItems: 5000,
    description: 'Phones or e-mails, one per item (normalized server-side).',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  @MaxLength(254, { each: true })
  values!: string[];

  @ApiPropertyOptional({ nullable: true, maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(200)
  note?: string | null;
}

export class OutreachSuppressionsAddResultDto {
  @ApiProperty({ description: 'New stop-list entries.' }) added!: number;
  @ApiProperty({ description: 'Existing leads marked do-not-contact.' })
  leadsMarked!: number;
  @ApiProperty({ description: 'Values that are neither a phone nor an email.' })
  invalid!: number;
}

export class OutreachSuppressionDto {
  @ApiProperty({
    enum: ['phone', 'email'],
    enumName: 'OutreachSuppressionKind',
  })
  kind!: 'phone' | 'email';
  @ApiProperty({ description: 'Masked except the last 4 characters.' })
  value!: string;
  @ApiProperty({ nullable: true, type: String }) note!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class OutreachSuppressionsDto {
  @ApiProperty() count!: number;
  @ApiProperty({ type: [OutreachSuppressionDto], description: 'Newest ≤ 50.' })
  latest!: OutreachSuppressionDto[];
}

export class OutreachStatsQueryDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Default: 30 days ago.',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Default: now.' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class OutreachPartnerStatsDto {
  @ApiProperty({
    nullable: true,
    type: OutreachPartnerDto,
    description: 'null = unassigned leads.',
  })
  partner!: OutreachPartnerDto | null;
  @ApiProperty({ description: 'Leads assigned (all time).' }) leads!: number;
  @ApiProperty({ description: 'Calls logged in the period.' }) calls!: number;
  @ApiProperty({ description: 'Emails sent in the period.' }) emails!: number;
  @ApiProperty({
    description: 'Leads that answered (interested/replied) in the period.',
  })
  replied!: number;
  @ApiProperty({ description: 'Leads that registered in the period.' })
  registered!: number;
  @ApiProperty({ description: 'Leads that paid / hired in the period.' })
  paid!: number;
  @ApiProperty({
    description: 'Partner commissions accrued in the period (not reversed).',
  })
  commissionCents!: number;
  @ApiProperty({ nullable: true, format: 'date-time', type: String })
  lastActivityAt!: string | null;
}

export class OutreachStatsDto {
  @ApiProperty({ format: 'date-time' }) from!: string;
  @ApiProperty({ format: 'date-time' }) to!: string;
  @ApiProperty({ type: [OutreachPartnerStatsDto] })
  partners!: OutreachPartnerStatsDto[];
  @ApiProperty() totals!: OutreachPartnerStatsDto;
  @ApiProperty({ description: 'Leads by status, all time.' })
  byStatus!: Record<string, number>;
}

export class OutreachContextDto {
  @ApiProperty({
    nullable: true,
    type: OutreachPartnerDto,
    description:
      'Set when this admin is a partner: they see only their own leads.',
  })
  scope!: OutreachPartnerDto | null;
  @ApiProperty({
    description: 'May import, assign and edit templates/settings.',
  })
  manager!: boolean;
  @ApiProperty({
    type: [OutreachPartnerDto],
    description: 'Active partners to assign leads to.',
  })
  partners!: OutreachPartnerDto[];
  @ApiProperty() settings!: OutreachSettingsDto;
  @ApiProperty({ description: 'Cold emails this admin may still send today.' })
  emailsLeftToday!: number;
}
