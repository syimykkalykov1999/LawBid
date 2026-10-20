import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const CATEGORIES = [
  'messages',
  'calls',
  'following',
  'new_cases',
  'bids',
  'cases',
  'social',
  'system',
  'marketing',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const NOTIFICATION_GROUPS = ['important', 'other'] as const;
export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number];

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class NotificationsQueryDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;

  /** Owner 2026-10-06: the bell's "Важные" / "Остальные" tabs. */
  @ApiPropertyOptional({
    enum: NOTIFICATION_GROUPS,
    enumName: 'NotificationGroup',
    description:
      'important: bids, cases, payments, account; other: likes, follows, comments, logins. Omit for all.',
  })
  @IsOptional()
  @IsIn(NOTIFICATION_GROUPS)
  group?: NotificationGroup;

  /** Owner 2026-10-18: the search box above the bell's list. */
  @ApiPropertyOptional({
    description:
      "Words from the stored text (a broadcast's title/body, a moderator's reason) or the name of the attorney in the notification, in any alphabet. Combines with `group`.",
    maxLength: 100,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q?: string;
}

export class NotificationActorDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'null for a client (no public profile).',
  })
  id!: string | null;

  @ApiProperty()
  displayName!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  username!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  avatarUrl!: string | null;
}

export class NotificationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  type!: string;

  @ApiProperty({ enum: CATEGORIES })
  category!: Category;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Ids and template params for `notif.<type>` (§9.1).',
  })
  payload!: Record<string, unknown>;

  @ApiPropertyOptional({ type: NotificationActorDto, nullable: true })
  actor!: NotificationActorDto | null;

  @ApiProperty({ description: '"Sarah и ещё N" = aggregateCount - 1 (§9.4).' })
  aggregateCount!: number;

  @ApiPropertyOptional({ type: Date, nullable: true })
  readAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;
}

export class ReadNotificationsDto {
  @ApiPropertyOptional({ type: [String], maxItems: 100 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  ids?: string[];

  @ApiPropertyOptional({ description: '"Отметить все как прочитанные".' })
  @IsOptional()
  @IsBoolean()
  all?: boolean;
}

export class ReadNotificationsResultDto {
  @ApiProperty()
  updated!: number;
}

export class BadgesDto {
  @ApiProperty()
  chatsUnread!: number;

  @ApiProperty()
  notificationsUnread!: number;

  @ApiProperty()
  total!: number;
}

export class CategorySettingDto {
  @ApiProperty({ enum: CATEGORIES })
  @IsIn(CATEGORIES)
  category!: Category;

  @ApiProperty()
  @IsBoolean()
  pushEnabled!: boolean;

  @ApiProperty()
  @IsBoolean()
  emailEnabled!: boolean;
}

export class CategorySettingViewDto extends CategorySettingDto {
  @ApiProperty({ description: '`system` can not be turned off (§9.5).' })
  locked!: boolean;
}

/** Owner 2026-10-20: the device's IANA time zone. */
export class TimezoneDto {
  @ApiProperty({ example: 'America/New_York' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  timezone!: string;
}

export class QuietHoursDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '22:00',
    description: 'Absent or null clears the quiet hours.',
  })
  @ValidateIf((o: QuietHoursDto) => o.start != null)
  @Matches(HHMM)
  start?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '07:00' })
  @ValidateIf((o: QuietHoursDto) => o.start != null)
  @Matches(HHMM)
  end?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'America/New_York',
  })
  @ValidateIf((o: QuietHoursDto) => o.start != null)
  @IsString()
  @MaxLength(64)
  timezone?: string | null;
}

export class NotificationSettingsDto {
  @ApiProperty({ type: [CategorySettingViewDto] })
  categories!: CategorySettingViewDto[];

  @ApiPropertyOptional({ type: QuietHoursDto, nullable: true })
  quietHours!: QuietHoursDto | null;
}

export class UpdateNotificationSettingsDto {
  @ApiProperty({ type: [CategorySettingDto] })
  @IsArray()
  @ArrayMaxSize(CATEGORIES.length)
  @ValidateNested({ each: true })
  @Type(() => CategorySettingDto)
  items!: CategorySettingDto[];
}

export class PushTokenDto {
  @ApiProperty({ description: 'FCM registration token.' })
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  token!: string;

  @ApiProperty({ enum: ['ios', 'android', 'web'] })
  @IsIn(['ios', 'android', 'web'])
  platform!: 'ios' | 'android' | 'web';

  @ApiPropertyOptional({
    description:
      'Owner 2026-10-20: this app keeps planner reminders locally and shows the reminder push itself (Android).',
  })
  @IsOptional()
  @IsBoolean()
  localReminders?: boolean;
}

/** Owner 2026-10-20: the planner reminders an iPhone has armed locally. */
export class ArmedRemindersDto {
  @ApiProperty({ description: 'FCM registration token of this device.' })
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  token!: string;

  @ApiProperty({
    type: [String],
    description: '`<taskId>@<remindAt ms>` of each armed reminder.',
  })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  ids!: string[];
}

/** Owner 2026-10-17: an iPhone's PushKit (VoIP) token for calls. */
export class VoipTokenDto {
  @ApiProperty({ description: 'PushKit token, hex.' })
  @Matches(/^[0-9a-f]{64,200}$/)
  token!: string;

  @ApiProperty({
    description: "The app's bundle id (the VoIP topic is it + '.voip').",
    example: 'com.lawbid.lawbid',
  })
  @Matches(/^com\.lawbid\.lawbid(\.[a-z]{2,12})?$/)
  bundleId!: string;

  @ApiProperty({ enum: ['sandbox', 'production'] })
  @IsIn(['sandbox', 'production'])
  environment!: 'sandbox' | 'production';
}

export class DeletePushTokenDto {
  @ApiProperty()
  @IsString()
  @MaxLength(4096)
  token!: string;
}

/** Owner 2026-10-01: which qualifications send "new case" alerts. */
export class NewCaseAlertsDto {
  @ApiProperty({
    description:
      "true = the profile's qualifications (default); false = practiceAreaIds",
  })
  useProfile!: boolean;

  @ApiProperty({ type: [String], description: 'The chosen list (custom).' })
  practiceAreaIds!: string[];

  @ApiProperty({ type: [String], description: "The profile's qualifications." })
  profilePracticeAreaIds!: string[];

  @ApiProperty({
    description:
      'Owner 2026-10-05: only urgent cases (urgent / very urgent, or a date that close).',
  })
  urgentOnly!: boolean;
}

export class UpdateNewCaseAlertsDto {
  @ApiProperty()
  @IsBoolean()
  useProfile!: boolean;

  @ApiPropertyOptional({ type: [String], maxItems: 300 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @IsUUID('all', { each: true })
  practiceAreaIds?: string[];

  /** Owner 2026-10-05: absent = unchanged. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  urgentOnly?: boolean;
}
