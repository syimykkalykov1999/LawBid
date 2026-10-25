import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** What an evidence archive may hold. */
export const LEGAL_SECTIONS = [
  'profile',
  'devices',
  'usernames',
  'chats',
  'groups',
  'channel_posts',
  'posts',
  'reels',
  'stories',
  'questions',
] as const;
export type LegalSection = (typeof LEGAL_SECTIONS)[number];

export const LEGAL_HOLD_TARGETS = [
  'user',
  'case',
  'conversation',
  'group',
] as const;
export type LegalHoldTarget = (typeof LEGAL_HOLD_TARGETS)[number];

export class LegalLookupQueryDto {
  @ApiProperty({
    minLength: 3,
    maxLength: 120,
    description: 'Phone, e-mail, @username, name or user id.',
  })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  q!: string;
}

export class LegalRequestParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  requestId!: string;
}

export class LegalUserParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;
}

export class LegalExportParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  exportId!: string;
}

export class LegalHoldParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  holdId!: string;
}

export class CreateLegalExportDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: LEGAL_SECTIONS, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(LEGAL_SECTIONS.length)
  @IsIn(LEGAL_SECTIONS, { each: true })
  sections!: LegalSection[];

  @ApiPropertyOptional({
    description: 'Only these direct chats; omitted = all of the person’s.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  conversationIds?: string[];

  @ApiPropertyOptional({ description: 'Only these groups; omitted = all.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  groupIds?: string[];

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  dateTo?: string;
}

export class CreateLegalHoldDto {
  @ApiProperty({ enum: LEGAL_HOLD_TARGETS })
  @IsIn(LEGAL_HOLD_TARGETS)
  targetType!: LegalHoldTarget;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  targetId!: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Omitted = until released by the owner.',
  })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}

export class LegalLookupHitDto {
  @ApiProperty() userId!: string;
  @ApiProperty({ nullable: true }) name!: string | null;
  @ApiProperty({ nullable: true }) role!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true }) phone!: string | null;
  @ApiProperty({ nullable: true }) email!: string | null;
  @ApiProperty({ nullable: true }) username!: string | null;
  @ApiProperty({ description: 'id | phone | email | username | name' })
  matchedBy!: string;
}

export class LegalExportDto {
  @ApiProperty() id!: string;
  @ApiProperty() requestId!: string;
  @ApiProperty() subjectUserId!: string;
  @ApiProperty() requestedBy!: string;
  @ApiProperty({ description: 'queued | running | ready | failed | expired' })
  status!: string;
  @ApiProperty({ type: Object }) selection!: Record<string, unknown>;
  @ApiProperty({ nullable: true, type: Object })
  rowCounts!: Record<string, number> | null;
  @ApiProperty({ nullable: true }) sizeBytes!: number | null;
  @ApiProperty({ nullable: true }) sha256!: string | null;
  @ApiProperty({ nullable: true }) manifestSha256!: string | null;
  @ApiProperty({ nullable: true }) manifestSignature!: string | null;
  @ApiProperty({ nullable: true, description: 'ed25519 | hmac-sha256' })
  signatureAlg!: string | null;
  @ApiProperty({ type: 'integer' }) downloadCount!: number;
  @ApiProperty({ nullable: true }) lastDownloadedAt!: string | null;
  @ApiProperty({ nullable: true }) error!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ nullable: true }) finishedAt!: string | null;
  @ApiProperty({ nullable: true }) expiresAt!: string | null;
}

export class LegalDownloadDto {
  @ApiProperty() url!: string;
  @ApiProperty({ type: 'integer' }) downloadsLeft!: number | null;
  @ApiProperty() expiresAt!: string;
  @ApiProperty({ nullable: true }) sha256!: string | null;
}

export class LegalHoldDto {
  @ApiProperty() id!: string;
  @ApiProperty() requestId!: string;
  @ApiProperty({ enum: LEGAL_HOLD_TARGETS }) targetType!: string;
  @ApiProperty() targetId!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ nullable: true }) expiresAt!: string | null;
  @ApiProperty({ nullable: true }) releasedAt!: string | null;
}

export class LegalAccountCardDto {
  @ApiProperty({ type: Object }) profile!: Record<string, unknown>;
  @ApiProperty({ type: Object, isArray: true })
  usernames!: Record<string, unknown>[];
  @ApiProperty({ type: Object }) counts!: Record<string, number>;
  @ApiProperty({ type: Object, isArray: true })
  conversations!: Record<string, unknown>[];
  @ApiProperty({ type: Object, isArray: true })
  groups!: Record<string, unknown>[];
  @ApiProperty({ type: Object, isArray: true })
  channels!: Record<string, unknown>[];
  @ApiProperty({ type: Object, isArray: true })
  sessions!: Record<string, unknown>[];
  @ApiProperty({ type: Object, isArray: true })
  holds!: Record<string, unknown>[];
}

export class UserNoticeDto {
  @ApiProperty({ description: 'May the notice be sent right now?' })
  allowed!: boolean;
  @ApiProperty({ type: String, nullable: true })
  blockedReason!: string | null;
  @ApiProperty({ description: 'The text the user would get.' }) text!: string;
  @ApiProperty({ description: 'ru | en' }) language!: string;
  @ApiProperty({ type: String, nullable: true }) userNotifiedAt!: string | null;
}

export class CustodyEntryDto {
  @ApiProperty() at!: string;
  @ApiProperty() adminId!: string;
  @ApiProperty({ description: 'legal_export.built | .queue | .download' })
  action!: string;
  @ApiProperty({ type: String, nullable: true }) ip!: string | null;
  @ApiProperty({ type: Object, nullable: true })
  details!: Record<string, unknown> | null;
}

export class TransparencyQueryDto {
  @ApiProperty({ minimum: 2020, maximum: 2100 })
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;
}

export class TransparencyReportDto {
  @ApiProperty() year!: number;
  @ApiProperty() total!: number;
  @ApiProperty({ type: Object }) byType!: Record<string, number>;
  @ApiProperty({ type: Object }) byStatus!: Record<string, number>;
  @ApiProperty({ type: Object }) byCountry!: Record<string, number>;
  @ApiProperty() accountsAffected!: number;
  @ApiProperty() withGagOrder!: number;
  @ApiProperty() usersNotified!: number;
  @ApiProperty() holdsPlaced!: number;
  @ApiProperty() productionsMade!: number;
}
