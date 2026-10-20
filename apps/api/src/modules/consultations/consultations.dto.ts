import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MaxTextChars } from '../../common/app-settings/max-text-chars.decorator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const CONSULTATION_STATUSES = [
  'pending',
  'confirmed',
  'declined',
  'cancelled',
] as const;
export const CONSULTATION_VIEWS = ['upcoming', 'pending', 'past'] as const;

// --- the attorney's schedule -------------------------------------------------

export class ConsultationWindowDto {
  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: 7,
    description: 'ISO weekday: 1 = Monday … 7 = Sunday',
  })
  @IsInt()
  @Min(1)
  @Max(7)
  weekday!: number;

  @ApiProperty({
    type: 'integer',
    minimum: 0,
    maximum: 1439,
    description: 'Minutes from midnight in the attorney time zone',
  })
  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute!: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 1440 })
  @IsInt()
  @Min(1)
  @Max(1440)
  endMinute!: number;
}

export class ConsultationTimeOffDto {
  @ApiProperty({ example: '2026-12-24' })
  @Matches(ISO_DATE)
  startsOn!: string;

  @ApiProperty({ example: '2026-12-31' })
  @Matches(ISO_DATE)
  endsOn!: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  note?: string;
}

export class ConsultationSettingsDto {
  @ApiProperty()
  enabled!: boolean;

  @ApiProperty({ type: 'integer', minimum: 10, maximum: 240 })
  slotMinutes!: number;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 120 })
  bufferMinutes!: number;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 336 })
  minNoticeHours!: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 90 })
  horizonDays!: number;

  @ApiProperty({ description: 'true = a booking is confirmed at once' })
  autoConfirm!: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'America/New_York',
  })
  timezone!: string | null;

  @ApiProperty({ type: ConsultationWindowDto, isArray: true })
  windows!: ConsultationWindowDto[];

  @ApiProperty({ type: ConsultationTimeOffDto, isArray: true })
  timeOff!: ConsultationTimeOffDto[];

  @ApiProperty({
    description:
      'Clients can book now: verified, subscription active, hours set.',
  })
  bookable!: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    enum: ['not_verified', 'no_subscription', 'no_hours', 'no_timezone'],
    description: 'Why bookable is false (when enabled is true).',
  })
  notBookableReason!: string | null;
}

export class UpdateConsultationSettingsDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ type: 'integer', minimum: 10, maximum: 240 })
  @IsInt()
  @Min(10)
  @Max(240)
  slotMinutes!: number;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 120 })
  @IsInt()
  @Min(0)
  @Max(120)
  bufferMinutes!: number;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 336 })
  @IsInt()
  @Min(0)
  @Max(336)
  minNoticeHours!: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 90 })
  @IsInt()
  @Min(1)
  @Max(90)
  horizonDays!: number;

  @ApiProperty()
  @IsBoolean()
  autoConfirm!: boolean;

  @ApiProperty({ example: 'America/New_York' })
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  timezone!: string;

  @ApiProperty({ type: ConsultationWindowDto, isArray: true, maxItems: 28 })
  @IsArray()
  @ArrayMaxSize(28)
  @ValidateNested({ each: true })
  @Type(() => ConsultationWindowDto)
  windows!: ConsultationWindowDto[];

  @ApiProperty({ type: ConsultationTimeOffDto, isArray: true, maxItems: 30 })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ConsultationTimeOffDto)
  timeOff!: ConsultationTimeOffDto[];
}

// --- slots --------------------------------------------------------------------

export class ConsultationSlotsQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  attorneyId!: string;

  @ApiPropertyOptional({
    example: '2026-10-21',
    description: 'First day, attorney local date. Default: today there.',
  })
  @IsOptional()
  @Matches(ISO_DATE)
  from?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 14, default: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(14)
  days?: number;
}

export class ConsultationSlotsDto {
  @ApiProperty({ format: 'uuid' })
  attorneyId!: string;

  @ApiProperty({ example: 'America/New_York' })
  timezone!: string;

  @ApiProperty({ type: 'integer' })
  slotMinutes!: number;

  @ApiProperty()
  autoConfirm!: boolean;

  @ApiProperty({ example: '2026-10-21' })
  from!: string;

  @ApiProperty({ type: 'integer' })
  days!: number;

  @ApiProperty({
    type: String,
    isArray: true,
    description: 'Start instants (UTC ISO), sorted.',
  })
  slots!: string[];

  @ApiProperty({
    type: String,
    isArray: true,
    description:
      'The same starts as wall clock in the attorney time zone (YYYY-MM-DDTHH:mm), one per slot.',
  })
  localSlots!: string[];

  @ApiProperty({
    example: '2026-12-31',
    description: 'Last bookable day (attorney local date).',
  })
  lastDate!: string;
}

// --- bookings -----------------------------------------------------------------

export class CreateConsultationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  attorneyId!: string;

  @ApiProperty({ example: '2026-10-21T14:00:00.000Z' })
  @IsISO8601({ strict: true })
  startsAt!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxTextChars('limits.consultation_note_chars')
  note?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: "One of the client's cases",
  })
  @IsOptional()
  @IsUUID('all')
  caseId?: string;
}

export class ConsultationIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class ConsultationReasonDto {
  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class RescheduleConsultationDto {
  @ApiProperty({ example: '2026-10-22T15:00:00.000Z' })
  @IsISO8601({ strict: true })
  startsAt!: string;
}

export class ConsultationsQueryDto {
  @ApiPropertyOptional({ enum: CONSULTATION_VIEWS, default: 'upcoming' })
  @IsOptional()
  @IsString()
  view?: (typeof CONSULTATION_VIEWS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class ConsultationPersonDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  displayName!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  username!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  avatarUrl!: string | null;
}

export class ConsultationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: CONSULTATION_STATUSES })
  status!: (typeof CONSULTATION_STATUSES)[number];

  @ApiProperty({ description: 'Start (UTC ISO)' })
  startsAt!: string;

  @ApiProperty({ description: 'End (UTC ISO)' })
  endsAt!: string;

  @ApiProperty({
    enum: ['attorney', 'client'],
    description: "The viewer's side",
  })
  viewerRole!: 'attorney' | 'client';

  @ApiProperty({ type: ConsultationPersonDto, description: 'The other side' })
  counterpart!: ConsultationPersonDto;

  @ApiProperty({ example: 'America/New_York' })
  attorneyTimezone!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  note!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  caseId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  conversationId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  cancelReason!: string | null;

  @ApiPropertyOptional({
    enum: ['attorney', 'client', 'system'],
    nullable: true,
  })
  cancelledBy!: 'attorney' | 'client' | 'system' | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  rescheduledAt!: string | null;

  @ApiProperty({
    description:
      'A call can be placed now: confirmed and within 10 minutes before the start until the end.',
  })
  canCall!: boolean;

  @ApiProperty()
  createdAt!: string;
}

export interface ConsultationPage {
  items: ConsultationDto[];
  nextCursor: string | null;
}
