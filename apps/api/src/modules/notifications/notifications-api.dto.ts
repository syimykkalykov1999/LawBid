import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class NotificationsQueryDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
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

  @ApiProperty({ enum: ['ios', 'android'] })
  @IsIn(['ios', 'android'])
  platform!: 'ios' | 'android';
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
}
