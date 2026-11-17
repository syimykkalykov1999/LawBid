import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class HotlineDisclosureDto {
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Text key (hotline.disclosure.client_wait / hotline.disclosure.attorney_offer / hotline.notice.short); null = show nothing (already seen).',
  })
  key!: string | null;

  @ApiPropertyOptional({
    enum: ['full', 'short'],
    enumName: 'HotlineDisclosureKind',
    nullable: true,
  })
  kind!: 'full' | 'short' | null;

  @ApiProperty({ description: 'hotline.disclosure_version' })
  version!: number;

  @ApiPropertyOptional({ nullable: true }) ru!: string | null;
  @ApiPropertyOptional({ nullable: true }) en!: string | null;
}

/** GET /hotline/config */
export class HotlineConfigDto {
  @ApiProperty({ description: 'Флаги → «Горячая линия».' }) enabled!: boolean;
  @ApiProperty() heartbeatSec!: number;
  @ApiProperty() offerTimeoutSec!: number;
  @ApiProperty() maxLanguages!: number;
  @ApiProperty() topicMaxChars!: number;
  @ApiProperty() countersIntervalSec!: number;
  @ApiProperty() notifyClaimSec!: number;
  @ApiProperty({ description: 'hotline.review_enabled' })
  reviewEnabled!: boolean;
  @ApiProperty({
    description: 'hotline.client_steps_enabled («Дальше / Назад»)',
  })
  clientStepsEnabled!: boolean;
  @ApiProperty({ type: HotlineDisclosureDto })
  disclosure!: HotlineDisclosureDto;
}

/** PUT /hotline/line — «Ожидать звонки». */
export class HotlineLineDto {
  @ApiProperty({
    type: [String],
    description: 'Two-letter states; only states of verified licences.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Length(2, 2, { each: true })
  states!: string[];

  @ApiProperty({ type: [String], description: 'Practice area codes.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  practiceAreas!: string[];

  @ApiProperty({ type: [String], description: 'Language codes (en, es, ru…).' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(16, { each: true })
  languages!: string[];

  @ApiPropertyOptional({
    default: true,
    description: '«Принимать звонки»; false = on the line, no new calls.',
  })
  @IsOptional()
  @IsBoolean()
  accepting?: boolean;
}

export class HotlineAcceptingDto {
  @ApiProperty() @IsBoolean() accepting!: boolean;
}

export class HotlineLineViewDto {
  @ApiProperty() online!: boolean;

  @ApiProperty({
    enum: ['idle', 'offered', 'busy', 'not_accepting', 'paused', 'off'],
    enumName: 'HotlineLineState',
  })
  state!: 'idle' | 'offered' | 'busy' | 'not_accepting' | 'paused' | 'off';

  @ApiProperty() accepting!: boolean;
  @ApiProperty({ type: [String] }) states!: string[];
  @ApiProperty({ type: [String] }) practiceAreas!: string[];
  @ApiProperty({ type: [String] }) languages!: string[];
  @ApiProperty() heartbeatSec!: number;
  @ApiProperty() offerTimeoutSec!: number;

  @ApiPropertyOptional({
    enum: ['free', 'plan', 'addon', 'trial'],
    enumName: 'HotlineAccessVia',
    nullable: true,
  })
  via!: 'free' | 'plan' | 'addon' | 'trial' | null;
}

/** POST /hotline/requests — «Связаться с адвокатом». */
export class HotlineRequestDto {
  @ApiProperty({ example: 'CA' }) @IsString() @Length(2, 2) state!: string;

  @ApiProperty() @IsString() @MaxLength(64) practiceArea!: string;

  @ApiProperty({ type: [String], description: 'Up to hotline.max_languages.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(16, { each: true })
  languages!: string[];

  @ApiProperty({
    description: '«О чём звонок», up to hotline.topic_max_chars.',
  })
  @IsString()
  @MaxLength(500)
  topic!: string;
}

export class HotlineLanguagesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(16, { each: true })
  languages!: string[];
}

/** POST /hotline/requests/:id/notify-me */
export class HotlineNotifyMeDto {
  @ApiPropertyOptional({
    description: 'IANA time zone of the phone (night window in its clock).',
    example: 'America/Los_Angeles',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timeZone?: string;

  @ApiPropertyOptional({ default: false, description: 'Notify at night too.' })
  @IsOptional()
  @IsBoolean()
  allowNight?: boolean;
}

export class HotlineLawyerDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'The client’s state' }) state!: string;
  @ApiPropertyOptional({ nullable: true, description: 'Bar number there.' })
  barNumber!: string | null;
}

export class HotlineRequestViewDto {
  @ApiProperty() id!: string;

  @ApiProperty({
    enum: ['searching', 'queued', 'offline', 'connected', 'ended', 'cancelled'],
    enumName: 'HotlineRequestStatus',
  })
  status!:
    'searching' | 'queued' | 'offline' | 'connected' | 'ended' | 'cancelled';

  @ApiPropertyOptional({
    nullable: true,
    description: 'Rough place: 1, 2-5, 6-20, 20+ (never exact).',
  })
  positionBand!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Rough wait: lt5, 5to15, 15to30, gt30 (minutes).',
  })
  waitBand!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'cancelled, lost, queue_full, notify_expired, notify_exhausted («Мы не дозвонились, оставьте заявку снова»), time_limit, ended',
  })
  endReason!: string | null;

  @ApiPropertyOptional({ type: HotlineLawyerDto, nullable: true })
  lawyer!: HotlineLawyerDto | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'ms; «Сообщите мне» ends',
  })
  notifyUntil!: number | null;

  @ApiPropertyOptional({ type: HotlineDisclosureDto, nullable: true })
  disclosure!: HotlineDisclosureDto | null;
}

export class HotlineOfferResultDto {
  @ApiProperty() ok!: boolean;

  @ApiProperty({
    enum: ['connected', 'late', 'gone', 'skipped'],
    enumName: 'HotlineOfferState',
  })
  state!: 'connected' | 'late' | 'gone' | 'skipped';
}

export class HotlineEndDto {
  @ApiProperty() ok!: boolean;
  @ApiProperty({ description: 'Talked seconds (from «Взять»).' })
  seconds!: number;
}

export class HotlineCounterDto {
  @ApiProperty({ description: 'b:<state~practice~lang> or l:<lang>' })
  key!: string;
  @ApiProperty({ description: 'Banded: 0, 1 (есть), 10+, 50+, 100+' })
  lawyers!: string;
  @ApiProperty() clients!: string;
}

export class HotlineCountersDto {
  @ApiProperty({ type: [HotlineCounterDto] }) items!: HotlineCounterDto[];
}

export class HotlineBucketRowDto {
  @ApiProperty() bucket!: string;
  @ApiProperty() lawyers!: number;
  @ApiProperty() waiting!: number;
}

export class HotlineHourDto {
  @ApiProperty() hour!: string;
  @ApiProperty() requests!: number;
  @ApiProperty() offers!: number;
  @ApiProperty() accepted!: number;
  @ApiProperty() declined!: number;
  @ApiProperty() timeouts!: number;
  @ApiProperty() ended!: number;
  @ApiProperty() talkSeconds!: number;
  @ApiProperty() notices!: number;
  @ApiProperty() peakOnline!: number;
}

/** GET /admin/hotline/live — exact numbers, Valkey only. */
export class HotlineLiveDto {
  @ApiProperty() enabled!: boolean;
  @ApiProperty() onLine!: number;
  @ApiProperty() idle!: number;
  @ApiProperty() offered!: number;
  @ApiProperty() inCall!: number;
  @ApiProperty() notAccepting!: number;
  @ApiProperty() paused!: number;
  @ApiProperty() waitingOnline!: number;
  @ApiProperty() waitingOffline!: number;
  @ApiProperty() callsNow!: number;
  @ApiProperty({ type: [HotlineBucketRowDto] }) buckets!: HotlineBucketRowDto[];
  @ApiProperty({ type: [HotlineHourDto] }) hours!: HotlineHourDto[];
}
