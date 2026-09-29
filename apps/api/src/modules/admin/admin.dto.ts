import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
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

// ---- Администраторы (docs/06 §2.3 item 13) ------------------------------

export class CreateAdminDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ enum: ADMIN_ROLES })
  @IsIn(ADMIN_ROLES)
  role!: AdminRoleName;
}

export class SetAdminRoleDto {
  @ApiProperty({ enum: ADMIN_ROLES })
  @IsIn(ADMIN_ROLES)
  role!: AdminRoleName;
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

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastLoginAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

// ---- Дашборд (docs/06 §2.3 item 1) -----------------------------------------

export class DashboardNewUsersDto {
  @ApiProperty({ type: 'integer' }) clients24h!: number;
  @ApiProperty({ type: 'integer' }) attorneys24h!: number;
  @ApiProperty({ type: 'integer' }) clients7d!: number;
  @ApiProperty({ type: 'integer' }) attorneys7d!: number;
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
  @ApiProperty({ type: 'integer', description: 'active × price (USD).' })
  revenueEstimateUsd!: number;
}

export class DashboardDto {
  @ApiProperty({ type: DashboardNewUsersDto })
  newUsers!: DashboardNewUsersDto;

  @ApiProperty({ type: DashboardVerificationDto })
  verification!: DashboardVerificationDto;

  @ApiProperty({ type: DashboardSubscriptionsDto })
  subscriptions!: DashboardSubscriptionsDto;

  @ApiProperty({ type: 'integer' }) openCases!: number;
  @ApiProperty({ type: 'integer' }) bids24h!: number;
  @ApiProperty({ type: 'integer' }) openReports!: number;
  @ApiProperty({ type: 'integer' }) openDisputes!: number;
  @ApiProperty({ type: 'integer' }) openContactIssues!: number;

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
  @ApiProperty({ type: Object, nullable: true }) before!: unknown;
  @ApiProperty({ type: Object, nullable: true }) after!: unknown;
  @ApiProperty({ type: String, nullable: true }) ip!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export interface AuditLogPage {
  items: AuditLogEntryDto[];
  nextCursor: string | null;
}
