import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const SANCTION_TEXT_MAX = 500;

/** docs/06 §2.3 item 3: "поиск по имени, email, телефону, @username, id". */
export class AdminUsersQueryDto {
  @ApiPropertyOptional({
    description:
      'Name (substring), email, phone (any format), @username or user id. Empty = newest users.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ enum: ['client', 'attorney', 'admin'] })
  @IsOptional()
  @IsIn(['client', 'attorney', 'admin'])
  role?: 'client' | 'attorney' | 'admin';

  @ApiPropertyOptional({
    enum: ['active', 'suspended', 'deletion_pending', 'deleted'],
  })
  @IsOptional()
  @IsIn(['active', 'suspended', 'deletion_pending', 'deleted'])
  status?: 'active' | 'suspended' | 'deletion_pending' | 'deleted';

  @ApiPropertyOptional({
    description:
      'Owner 2026-10-04: clients of this state and attorneys licensed in it.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z0-9]{2}$/)
  stateCode?: string;

  @ApiPropertyOptional({
    example: 'CA',
    description: 'Owner 2026-10-05: people of this country only.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Registered at or after (inclusive).',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Registered before (exclusive).',
  })
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
    maximum: 50,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class AdminUserIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class WarnUserDto {
  @ApiPropertyOptional({
    type: String,
    maxLength: SANCTION_TEXT_MAX,
    description:
      'Internal reason (audit + moderation_actions); the user gets the moderation_notice template.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(SANCTION_TEXT_MAX)
  reason = '';
}

export class SuspendUserDto {
  @ApiPropertyOptional({ type: String, maxLength: SANCTION_TEXT_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(SANCTION_TEXT_MAX)
  reason = '';
}

export const USERS_BULK_ACTIONS = ['suspend', 'restore', 'logout'] as const;

/** Owner 2026-10-04: one action for up to 500 users, one reason for all. */
export class AdminUsersBulkDto {
  @ApiProperty({ enum: USERS_BULK_ACTIONS, enumName: 'AdminUsersBulkAction' })
  @IsIn(USERS_BULK_ACTIONS)
  action!: (typeof USERS_BULK_ACTIONS)[number];

  @ApiProperty({ type: [String], format: 'uuid', minItems: 1, maxItems: 500 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  ids!: string[];

  @ApiPropertyOptional({ type: String, maxLength: SANCTION_TEXT_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(SANCTION_TEXT_MAX)
  reason = '';
}

// ---- responses ----------------------------------------------------------

export class AdminUserListItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['client', 'attorney', 'admin'],
  })
  role!: string | null;
  @ApiProperty({ enum: ['active', 'suspended', 'deletion_pending', 'deleted'] })
  status!: string;
  @ApiProperty({ type: String, nullable: true }) firstName!: string | null;
  @ApiProperty({ type: String, nullable: true }) lastName!: string | null;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ example: 'US', description: 'Country the person works in.' })
  countryCode!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Attorneys only.' })
  username!: string | null;
  @ApiProperty({ type: String, nullable: true })
  verificationStatus!: string | null;
  @ApiProperty({ type: String, nullable: true }) avatarUrl!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export interface AdminUsersPage {
  items: AdminUserListItemDto[];
  nextCursor: string | null;
}

export class AdminUserSessionDto {
  @ApiProperty({ format: 'uuid' }) sessionChainId!: string;
  @ApiProperty({ type: String, nullable: true }) deviceName!: string | null;
  @ApiProperty({ type: String, nullable: true }) platform!: string | null;
  @ApiProperty({ type: String, nullable: true }) appVersion!: string | null;
  @ApiProperty({ type: String, nullable: true }) ip!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastUsedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: 'integer', description: 'Push tokens bound to it.' })
  pushTokens!: number;
}

export class AdminUserCaseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() status!: string;
  @ApiProperty() stateCode!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AdminUserBidDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) caseId!: string;
  @ApiProperty() caseTitle!: string;
  @ApiProperty() status!: string;
  @ApiProperty() feeType!: string;
  @ApiProperty({ type: 'integer' }) amountCents!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AdminUserSubscriptionDto {
  @ApiProperty() status!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  trialEndsAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  currentPeriodEnd!: string | null;
  @ApiProperty() cancelAtPeriodEnd!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  graceEndsAt!: string | null;
}

/** Owner 2026-10-05 (audit): a license as the admin reads it. */
export class AdminUserLicenseDto {
  @ApiProperty() stateCode!: string;
  @ApiProperty() barNumber!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiresAt!: string | null;
}

export class AdminAttorneyCardDto {
  @ApiProperty() username!: string;
  @ApiProperty({ type: String, nullable: true }) firmName!: string | null;
  @ApiProperty() verificationStatus!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  verifiedAt!: string | null;
  @ApiProperty() ratingAvg!: number;
  @ApiProperty({ type: 'integer' }) ratingCount!: number;
  @ApiProperty({ type: 'integer' }) followersCount!: number;
  @ApiProperty({ type: 'integer' }) postsCount!: number;
  @ApiProperty({ type: [String], description: '`NY:verified`, …' })
  licenses!: string[];
  @ApiProperty({ type: [AdminUserLicenseDto] })
  licenseItems!: AdminUserLicenseDto[];
  @ApiProperty({
    type: [String],
    description: 'English names of the chosen practice areas.',
  })
  practices!: string[];
  @ApiProperty({ type: AdminUserSubscriptionDto, nullable: true })
  subscription!: AdminUserSubscriptionDto | null;
}

export class AdminClientCardDto {
  @ApiProperty() stateCode!: string;
  @ApiProperty({ type: String, nullable: true })
  preferredContactMethod!: string | null;
  @ApiProperty({ type: [String] }) preferredLanguages!: string[];
}

export class AdminUserCardDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, nullable: true }) role!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty({ type: String, nullable: true })
  suspendedReason!: string | null;
  @ApiProperty({ type: String, nullable: true }) firstName!: string | null;
  @ApiProperty({ type: String, nullable: true }) lastName!: string | null;
  @ApiProperty({ type: String, nullable: true }) avatarUrl!: string | null;
  @ApiProperty() uiLanguage!: string;
  @ApiProperty() hasEmail!: boolean;
  @ApiProperty() hasPhone!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deletedAt!: string | null;
  @ApiProperty({ type: AdminAttorneyCardDto, nullable: true })
  attorney!: AdminAttorneyCardDto | null;
  @ApiProperty({ type: AdminClientCardDto, nullable: true })
  client!: AdminClientCardDto | null;
  @ApiProperty({ type: [AdminUserSessionDto] })
  sessions!: AdminUserSessionDto[];
  @ApiProperty({ type: [AdminUserCaseDto], description: 'Last 20 (client).' })
  cases!: AdminUserCaseDto[];
  @ApiProperty({ type: [AdminUserBidDto], description: 'Last 20 (attorney).' })
  bids!: AdminUserBidDto[];
  @ApiProperty({ type: 'integer' }) warnings!: number;
}

/** docs/06 §2.1: contacts are sensitive — X-Justification required. */
export class AdminUserContactsDto {
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  emailVerifiedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  phoneVerifiedAt!: string | null;
  @ApiProperty({ type: String, nullable: true })
  preferredContactNote!: string | null;
}

export class SanctionResultDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: 'integer', description: 'Sessions revoked.' })
  revokedSessions!: number;
  @ApiProperty({ type: 'integer', description: 'Client cases archived.' })
  archivedCases!: number;
  @ApiProperty({ type: 'integer', description: 'Attorney bids withdrawn.' })
  withdrawnBids!: number;
}

/** Owner 2026-10-01: support changes the phone on the user's request
 * (lost phone / new number) — the reason is mandatory for the audit. */
export class ChangeUserPhoneDto {
  @ApiProperty({ example: '+13125550123' })
  @Transform(trim)
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @ApiPropertyOptional({ type: String, maxLength: SANCTION_TEXT_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(SANCTION_TEXT_MAX)
  reason = '';
}

export class PhoneChangedDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty() phone!: string;
  @ApiProperty() revokedSessions!: number;
}
