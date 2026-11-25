import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
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

/** GET /hotline/config `access` (plan PR 6, mockup a2): may this attorney
 * wait for calls, and through what. */
export class HotlineAccessDto {
  @ApiProperty({
    enum: ['on_for_all', 'by_subscription', 'off_for_all'],
    enumName: 'HotlineMode',
  })
  mode!: 'on_for_all' | 'by_subscription' | 'off_for_all';

  @ApiProperty() allowed!: boolean;

  @ApiPropertyOptional({
    enum: ['free', 'plan', 'addon', 'trial'],
    enumName: 'HotlineAccessVia',
    nullable: true,
  })
  via!: 'free' | 'plan' | 'addon' | 'trial' | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'off_for_all, not_in_plan, addon_required (when not allowed)',
  })
  reason!: string | null;
}

/** GET /hotline/config */
export class HotlineConfigDto {
  @ApiProperty({ description: 'Флаги → «Горячая линия».' }) enabled!: boolean;
  @ApiProperty() heartbeatSec!: number;
  @ApiProperty() offerTimeoutSec!: number;
  @ApiProperty() maxLanguages!: number;
  @ApiPropertyOptional({
    description:
      'hotline.attorney_max_languages: languages on the attorney line (0 = no limit). Optional for apps that met an older server.',
  })
  attorneyMaxLanguages?: number;
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

  @ApiPropertyOptional({
    enum: ['on_for_all', 'by_subscription', 'off_for_all'],
    enumName: 'HotlineMode',
    description:
      '`hotline.mode` for every role (off_for_all: no buttons). Optional for apps that met an older server.',
  })
  mode?: 'on_for_all' | 'by_subscription' | 'off_for_all';

  @ApiPropertyOptional({
    type: HotlineAccessDto,
    nullable: true,
    description: 'Attorneys only (null for clients and assistants).',
  })
  access!: HotlineAccessDto | null;
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

  @ApiProperty({
    type: [String],
    description:
      'Language codes (en, es, ru…) from the full language list, up to hotline.attorney_max_languages (owner 25.11).',
  })
  @IsArray()
  @ArrayMinSize(1)
  // payload bound only (more than the whole list); the admin number decides
  @ArrayMaxSize(500)
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

/** POST /hotline/call-back — the client calls the same attorney again
 * (audit 17.11 #6; the attorney never calls the client). */
export class HotlineCallBackDto {
  @ApiProperty({ description: 'The attorney of a recent hotline call.' })
  @IsUUID()
  attorneyId!: string;

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

/** POST /hotline/disclosure/ack — «Понятно» under the disclosure. */
export class HotlineDisclosureAckDto {
  @ApiPropertyOptional({
    description:
      'The text version the person saw (HotlineDisclosureDto.version); an older one is not counted.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
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

/** POST /hotline/requests/:id/claim — from the «Адвокат на линии» notice. */
export class HotlineClaimDto {
  @ApiPropertyOptional({
    description:
      'The notice’s claimToken (push data / `hotline:notify`); omit when the client taps «Позвонить сейчас» in the app itself.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  token?: string;
}

export class HotlineLawyerDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) username!: string | null;
  @ApiPropertyOptional({ nullable: true }) avatarUrl!: string | null;
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

  @ApiPropertyOptional({
    nullable: true,
    description: 'The 1:1 voice call while connected (GET /calls/:id).',
  })
  callId!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'The direct chat of the two after the call.',
  })
  conversationId!: string | null;
}

export class HotlineOfferResultDto {
  @ApiProperty() ok!: boolean;

  @ApiProperty({
    enum: ['connected', 'late', 'gone', 'skipped'],
    enumName: 'HotlineOfferState',
  })
  state!: 'connected' | 'late' | 'gone' | 'skipped';

  @ApiPropertyOptional({
    nullable: true,
    description:
      'The 1:1 voice call opened by «Взять» (GET /calls/:id, `call:signal`, GET /calls/ice-servers). Audio only, never recorded.',
  })
  callId?: string | null;
}

export class HotlineEndDto {
  @ApiProperty() ok!: boolean;
  @ApiProperty({ description: 'Talked seconds (from «Взять»).' })
  seconds!: number;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'The direct chat of the two, opened or reused after the call (WhatsApp-style).',
  })
  conversationId?: string | null;
}

/** «Клиент ждёт · язык» (plan step 6, mockup a7). */
export class HotlineWaitingDto {
  @ApiProperty() requestId!: string;
  @ApiProperty() topic!: string;
  @ApiProperty() state!: string;
  @ApiProperty() practiceArea!: string;
  @ApiProperty({ description: 'The call language (matched to his line).' })
  language!: string;
  @ApiProperty({ description: 'ms, «ждёт 1:40» counts from here' })
  waitingSince!: number;
}

/** POST /hotline/heartbeat */
export class HotlineHeartbeatDto {
  @ApiProperty() ok!: boolean;
  @ApiProperty({ description: 'Always 0 (the shape of HotlineEndDto).' })
  seconds!: number;
  @ApiPropertyOptional({
    type: HotlineWaitingDto,
    nullable: true,
    description:
      'In a hotline call with «Принимать звонки» on: the client who waits longest in his queues.',
  })
  waiting?: HotlineWaitingDto | null;
}

/** POST /hotline/requests/:id/offer-case — «Предложить дело». */
export class HotlineOfferCaseDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 10_000_000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  budgetAmountDollars?: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @ApiPropertyOptional({
    description:
      'The same consent as POST /cases (asked once; 403 CLIENT_CONTACT_SHARING_CONSENT_REQUIRED until given).',
  })
  @IsOptional()
  @IsBoolean()
  clientContactSharingConsent?: boolean;
}

export class HotlineOfferCaseResultDto {
  @ApiProperty() caseId!: string;
  @ApiPropertyOptional({ nullable: true }) inviteId!: string | null;
}

/** POST /hotline/requests/:id/review — «Как прошёл разговор?». */
export class HotlineReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  stars!: number;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  comment?: string;
}

export class HotlineOkDto {
  @ApiProperty() ok!: boolean;
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

/** One UTC day of the nightly snapshot. */
export class HotlineStatsDayDto {
  @ApiProperty({ description: 'YYYY-MM-DD (UTC)' }) day!: string;
  @ApiProperty() calls!: number;
  @ApiProperty() talkSeconds!: number;
  @ApiProperty({ description: 'calls turned into a case («Предложить дело»)' })
  casesOffered!: number;
  @ApiProperty() reviews!: number;
  @ApiProperty({
    description: 'sum of the stars (average = starsSum / reviews)',
  })
  starsSum!: number;
  @ApiProperty() clients!: number;
  @ApiProperty() attorneys!: number;
}

export class HotlineStatsTotalsDto {
  @ApiProperty() calls!: number;
  @ApiProperty() talkSeconds!: number;
  @ApiProperty() casesOffered!: number;
  @ApiProperty() reviews!: number;
  @ApiProperty() starsSum!: number;
  @ApiProperty({ description: 'client-days (people per day added up)' })
  clients!: number;
  @ApiProperty({ description: 'attorney-days (people per day added up)' })
  attorneys!: number;
}

export class HotlineStatsRowDto {
  @ApiProperty() key!: string;
  @ApiProperty() calls!: number;
}

/** GET /admin/hotline/stats — the nightly snapshot of the last 30 days. */
export class HotlineStatsDto {
  @ApiProperty({ description: 'ISO time the snapshot was counted' })
  computedAt!: string;
  @ApiProperty({ type: [HotlineStatsDayDto] }) days!: HotlineStatsDayDto[];
  @ApiProperty({ type: HotlineStatsTotalsDto }) totals!: HotlineStatsTotalsDto;
  @ApiProperty({ type: [HotlineStatsRowDto] }) states!: HotlineStatsRowDto[];
  @ApiProperty({ type: [HotlineStatsRowDto] }) practices!: HotlineStatsRowDto[];
  @ApiProperty({ type: [HotlineStatsRowDto] })
  endReasons!: HotlineStatsRowDto[];
}
