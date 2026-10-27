import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsISO8601,
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

export const ADMIN_ROLES = [
  'super_admin',
  'moderator',
  'verifier',
  'support',
  'finance',
] as const;
export type AdminRoleName = (typeof ADMIN_ROLES)[number];

/** Staff package T2: the three workspaces (same keys as the enum
 * `admin_workspace` in the database). */
export const ADMIN_WORKSPACES = ['mass', 'finance', 'owner'] as const;
export type AdminWorkspaceName = (typeof ADMIN_WORKSPACES)[number];

// ---- Администраторы (docs/06 §2.3 item 13) ------------------------------

export class CreateAdminDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ enum: ADMIN_ROLES })
  @IsIn(ADMIN_ROLES)
  role!: AdminRoleName;

  @ApiPropertyOptional({
    description:
      'Starting toggles; omitted = the defaults of the role. Money, keys and admin sections are never grantable.',
    type: 'object',
    additionalProperties: { type: 'string', enum: ['view', 'manage'] },
  })
  @IsOptional()
  @IsObject()
  permissions?: Record<string, string>;

  @ApiPropertyOptional({
    description:
      'Super admin only: lets this admin create and manage other admins within their own access.',
  })
  @IsOptional()
  @IsBoolean()
  canManageAdmins?: boolean;

  @ApiPropertyOptional({
    description:
      'Super admin only: «без персональных данных» — phones, emails and names come back masked.',
  })
  @IsOptional()
  @IsBoolean()
  noPii?: boolean;
}

export class SetAdminPermissionsDto {
  @ApiProperty({
    description:
      'Area → "view" | "manage". Areas left out are closed. Applies at once.',
    type: 'object',
    additionalProperties: { type: 'string', enum: ['view', 'manage'] },
  })
  @IsObject()
  permissions!: Record<string, string>;

  @ApiPropertyOptional({
    description:
      'Super admin only: the right to create and manage other admins. Omitted = unchanged.',
  })
  @IsOptional()
  @IsBoolean()
  canManageAdmins?: boolean;

  @ApiPropertyOptional({
    description:
      'Super admin only: «без персональных данных». Omitted = unchanged.',
  })
  @IsOptional()
  @IsBoolean()
  noPii?: boolean;
}

/** Owner 2026-10-05: the countries an employee works with. */
export class SetAdminCountriesDto {
  @ApiProperty({
    type: [String],
    description:
      'ISO 3166-1 alpha-2 codes; an empty list = every country. Applies at once.',
    example: ['CA'],
  })
  @IsArray()
  @ArrayMaxSize(300)
  @Matches(/^[A-Z]{2}$/, { each: true })
  countries!: string[];
}

export class SetAdminCredentialsDto {
  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  login?: string;

  @ApiPropertyOptional({ minLength: 10, maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;
}

export class SetAdminRoleDto {
  @ApiProperty({ enum: ADMIN_ROLES })
  @IsIn(ADMIN_ROLES)
  role!: AdminRoleName;
}

/** Staff package T2: `GET /admin/admins?workspace=mass`. */
export class ListAdminsQueryDto {
  @ApiPropertyOptional({
    enum: ADMIN_WORKSPACES,
    description: 'Only the admins of this workspace.',
  })
  @IsOptional()
  @IsIn(ADMIN_WORKSPACES)
  workspace?: AdminWorkspaceName;
}

/** Staff package T2 (owner only). */
export class SetAdminWorkspaceDto {
  @ApiProperty({ enum: ADMIN_WORKSPACES })
  @IsIn(ADMIN_WORKSPACES)
  workspace!: AdminWorkspaceName;
}

/** Staff package T2 (owner only). */
export class SetAdminHeadDto {
  @ApiProperty({
    description:
      'true = make this admin the head of their workspace; false = clear it.',
  })
  @IsBoolean()
  head!: boolean;
}

export class AdminIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class AdminAccountDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty({ enum: ADMIN_ROLES })
  role!: AdminRoleName;

  @ApiProperty({ enum: ['active', 'disabled'] })
  status!: 'active' | 'disabled';

  @ApiProperty({ description: 'Authenticator bound.' })
  totpEnabled!: boolean;

  @ApiProperty({ type: String, nullable: true })
  login!: string | null;

  @ApiProperty({ description: 'A password is set.' })
  hasPassword!: boolean;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string', enum: ['view', 'manage'] },
  })
  permissions!: Record<string, 'view' | 'manage'>;

  @ApiProperty({ description: 'May create and manage other admins.' })
  canManageAdmins!: boolean;

  @ApiProperty({
    description:
      'Owner 2026-10-16: personal data (phone, email, name) is masked for this admin.',
  })
  noPii!: boolean;

  @ApiProperty({
    type: [String],
    description:
      'Countries this admin works with (ISO 3166-1 alpha-2); empty = every country.',
  })
  countries!: string[];

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Owner 2026-10-06: the country partner whose team this admin is in (null = LawBid staff).',
  })
  countryPartnerId!: string | null;

  @ApiProperty({ description: 'This admin is the country partner themself.' })
  partnerLead!: boolean;

  @ApiProperty({
    enum: ADMIN_WORKSPACES,
    description:
      'Staff package: the workspace this admin works in (the super admin is always the owner).',
  })
  workspace!: AdminWorkspaceName;

  @ApiProperty({
    description:
      'Staff package: the head of that workspace (one per workspace, none in finance).',
  })
  workspaceHead!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastLoginAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class AdminSessionIdParamDto {
  @ApiProperty({ maxLength: 64 })
  @IsString()
  @MaxLength(64)
  sessionId!: string;
}

export class AdminSessionRowDto {
  @ApiProperty() sessionId!: string;
  @ApiProperty({ format: 'uuid' }) adminId!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ type: String, nullable: true }) login!: string | null;
  @ApiProperty({ enum: ADMIN_ROLES }) role!: AdminRoleName;
  @ApiProperty({ type: String, nullable: true }) ip!: string | null;
  @ApiProperty({ type: String, nullable: true }) device!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) lastSeenAt!: string;
  @ApiProperty({ type: String, nullable: true }) lastAction!: string | null;
  @ApiProperty({ description: 'This is the session asking.' })
  current!: boolean;
}

// ---- Дашборд (docs/06 §2.3 item 1) -----------------------------------------

export class DashboardNewUsersDto {
  @ApiProperty({ type: 'integer' }) clients24h!: number;
  @ApiProperty({ type: 'integer' }) attorneys24h!: number;
  @ApiProperty({ type: 'integer' }) clients7d!: number;
  @ApiProperty({ type: 'integer' }) attorneys7d!: number;
}

export class DashboardRoleTotalsDto {
  @ApiProperty({
    type: 'integer',
    description: 'Accounts of this role, not deleted.',
  })
  total!: number;
  @ApiProperty({ type: 'integer', description: 'Not suspended, not deleted.' })
  active!: number;
  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      'Attorneys: verified licence. Clients: approved verification. null where it does not apply.',
  })
  verified!: number | null;
}

/** Counted once a day (not per page open); see DashboardService. */
export class DashboardTotalsDto {
  @ApiProperty({ type: DashboardRoleTotalsDto })
  clients!: DashboardRoleTotalsDto;
  @ApiProperty({ type: DashboardRoleTotalsDto })
  attorneys!: DashboardRoleTotalsDto;
  @ApiProperty({
    type: DashboardRoleTotalsDto,
    description:
      'Assistant seats (assistant_memberships): total = invited + active, active = joined.',
  })
  assistants!: DashboardRoleTotalsDto;
  @ApiProperty({ type: DashboardRoleTotalsDto })
  admins!: DashboardRoleTotalsDto;
  @ApiProperty({
    type: DashboardRoleTotalsDto,
    description: 'Clients + attorneys + admins + assistants.',
  })
  all!: DashboardRoleTotalsDto;
  @ApiProperty({
    format: 'date-time',
    description:
      'When these totals were counted (daily or by the admin button).',
  })
  computedAt!: string;
}

export class DashboardVerificationDto {
  @ApiProperty({ type: 'integer', description: 'submitted + in_review' })
  queueSize!: number;

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Age of the oldest waiting request, seconds.',
  })
  oldestAgeSeconds!: number | null;
}

export class DashboardSubscriptionsDto {
  @ApiProperty({ type: 'integer' }) trialing!: number;
  @ApiProperty({ type: 'integer' }) active!: number;
  @ApiProperty({ type: 'integer' }) pastDue!: number;
  @ApiProperty({
    type: 'integer',
    description:
      'Live subscriptions (same rule as the gate and /admin/overview): trialing + active + past_due still in grace.',
  })
  live!: number;
  @ApiProperty({
    type: 'integer',
    description:
      'Monthly recurring revenue, cents: active + past_due in grace; monthly price_cents (incl. seats) + yearly price_cents / 12. null for everyone but the super admin (money is closed).',
    nullable: true,
  })
  revenueEstimateCents!: number | null;
  @ApiProperty({
    type: 'integer',
    description: 'revenueEstimateCents rounded to whole USD; null like it.',
    nullable: true,
  })
  revenueEstimateUsd!: number | null;
}

/** GET /admin/counts (owner 2026-10-22, client economy plan package J). */
export class AdminCountsDto {
  @ApiProperty({
    type: 'integer',
    description: 'Verification requests waiting.',
  })
  verificationQueue!: number;

  @ApiProperty({ type: 'integer', description: 'Open reports.' })
  openReports!: number;

  @ApiProperty({
    type: 'integer',
    description: 'Support tickets unread by the team.',
  })
  supportUnread!: number;

  @ApiProperty({
    type: 'integer',
    description: 'Attorneys in the trust queue.',
  })
  trustQueue!: number;
}

export class DashboardDto {
  @ApiProperty({ type: DashboardNewUsersDto })
  newUsers!: DashboardNewUsersDto;

  @ApiProperty({ type: DashboardTotalsDto })
  totals!: DashboardTotalsDto;

  @ApiProperty({ type: DashboardVerificationDto })
  verification!: DashboardVerificationDto;

  @ApiProperty({ type: DashboardSubscriptionsDto })
  subscriptions!: DashboardSubscriptionsDto;

  @ApiProperty({ type: 'integer' }) openCases!: number;
  @ApiProperty({ type: 'integer' }) bids24h!: number;
  @ApiProperty({
    type: 'integer',
    description: 'Owner 2026-10-05: client → attorney case invites sent.',
  })
  invites24h!: number;
  @ApiProperty({ type: 'integer' }) openReports!: number;
  @ApiProperty({ type: 'integer' }) openDisputes!: number;
  @ApiProperty({ type: 'integer' }) openContactIssues!: number;
  @ApiProperty({
    type: 'integer',
    description: 'Owner 2026-10-05: requests for more assistant seats.',
  })
  seatLimitRequests!: number;
  @ApiProperty({
    type: 'integer',
    description:
      'Owner 2026-10-05 (client fraud): accounts waiting for a check or restricted.',
  })
  fraudQueue!: number;
  @ApiProperty({
    type: 'integer',
    description:
      'Owner 2026-10-05: blocked fraudsters refused at sign-in + accounts blocked automatically, 7 days.',
  })
  fraudBlocked7d!: number;

  @ApiProperty({
    format: 'date-time',
    description: 'When the numbers were computed (cached ≤ 60 s).',
  })
  computedAt!: string;
}

// ---- Журнал аудита (docs/06 §2.3 item 12) ------------------------------------

export class AuditLogQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Administrator.' })
  @IsOptional()
  @IsUUID('all')
  adminId?: string;

  @ApiPropertyOptional({
    description: 'Action prefix, e.g. `admin.login` or `verification.`',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @ApiPropertyOptional({
    description: 'Object type, e.g. `verification_request`.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  targetType?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  targetId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class AuditLogEntryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) adminId!: string;
  @ApiProperty({ type: String, nullable: true }) adminEmail!: string | null;
  @ApiProperty() action!: string;
  @ApiProperty() targetType!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  targetId!: string | null;
  @ApiProperty({ type: String, nullable: true }) justification!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Coded reason of a private-content read.',
  })
  reasonCode!: string | null;
  @ApiProperty({ type: Object, nullable: true }) before!: unknown;
  @ApiProperty({ type: Object, nullable: true }) after!: unknown;
  @ApiProperty({ type: String, nullable: true }) ip!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AccessReportQueryDto {
  @ApiPropertyOptional({
    description: 'UTC month, YYYY-MM. Default: last month.',
    example: '2026-09',
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month?: string;
}

export class AccessReportRowDto {
  @ApiProperty({ format: 'uuid' }) adminId!: string;
  @ApiProperty({ type: String, nullable: true }) adminEmail!: string | null;
  @ApiProperty({
    description:
      'chat_messages, message_body, call_metadata, case_files, private_document',
  })
  kind!: string;
  @ApiProperty({ type: String, nullable: true }) reasonCode!: string | null;
  @ApiProperty() count!: number;
}

export class AccessReportDto {
  @ApiProperty() month!: string;
  @ApiProperty({ format: 'date-time' }) from!: string;
  @ApiProperty({ format: 'date-time' }) to!: string;
  @ApiProperty() total!: number;
  @ApiProperty({ type: AccessReportRowDto, isArray: true })
  rows!: AccessReportRowDto[];
}

export class ChainCheckDto {
  @ApiProperty() checked!: number;
  @ApiProperty({ type: Number, nullable: true }) brokenAtSeq!: number | null;
  @ApiProperty({ type: String, nullable: true }) headHash!: string | null;
  @ApiProperty({ type: Number, nullable: true }) headSeq!: number | null;
}

export interface AuditLogPage {
  items: AuditLogEntryDto[];
  nextCursor: string | null;
}

// ---- Шаблоны прав (owner 2026-10-02) ----------------------------------

export class AdminRoleTemplateDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string', enum: ['view', 'manage'] },
  })
  permissions!: Record<string, string>;
  @ApiProperty() updatedAt!: string;
}

export class SaveAdminRoleTemplateDto {
  @ApiProperty({ minLength: 2, maxLength: 60 })
  @IsString()
  @MaxLength(60)
  name!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string', enum: ['view', 'manage'] },
  })
  @IsObject()
  permissions!: Record<string, string>;
}

// ---- Owner 2026-10-16: presets and invite links -------------------------

export class AdminPresetDto {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: ADMIN_ROLES }) role!: AdminRoleName;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string', enum: ['view', 'manage'] },
  })
  permissions!: Record<string, string>;
  @ApiProperty({ description: 'Personal data is masked.' }) noPii!: boolean;
  @ApiProperty({ description: 'Creates another owner.' }) dangerous!: boolean;
}

export class InviteAdminDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({
    description:
      'Preset key from GET /admin/admins/presets (owner, accountant, moderator, support, viewer).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  preset?: string;

  @ApiPropertyOptional({
    enum: ADMIN_ROLES,
    description: 'Default: the preset’s role.',
  })
  @IsOptional()
  @IsIn(ADMIN_ROLES)
  role?: AdminRoleName;

  @ApiPropertyOptional({
    description: 'Overrides the preset’s toggles (area → view | manage).',
    type: 'object',
    additionalProperties: { type: 'string', enum: ['view', 'manage'] },
  })
  @IsOptional()
  @IsObject()
  permissions?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'Overrides the preset’s «без персональных данных».',
  })
  @IsOptional()
  @IsBoolean()
  noPii?: boolean;
}

export class AdminInviteDto {
  @ApiProperty({ description: 'Secret part of the link; shown once.' })
  token!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Full link when ADMIN_PANEL_URL is set; otherwise null and the panel builds /invite/<token> itself.',
  })
  url!: string | null;

  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
}

export class AdminInviteResultDto {
  @ApiProperty({ type: AdminAccountDto }) admin!: AdminAccountDto;
  @ApiProperty({ type: AdminInviteDto }) invite!: AdminInviteDto;
}
