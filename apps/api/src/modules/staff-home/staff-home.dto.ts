import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// ---- the recommendation text (plain Russian, from the evidence) ------------

export class StaffRecommendationDto {
  @ApiProperty({ enum: ['reward', 'train', 'replace'] })
  advice!: string;
  @ApiProperty({ description: '«Премировать» / «Обучить» / «Заменить».' })
  adviceLabel!: string;
  @ApiProperty({ description: 'What the button will do.' })
  actionLabel!: string;
  @ApiProperty() headline!: string;
  @ApiProperty({ type: [String], description: 'The proof, one number a line.' })
  lines!: string[];
}

// ---- GET admin/staff/today -------------------------------------------------

export class StaffTodayAppealDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ description: 'Appeal number («№N»).' }) number!: number;
  @ApiProperty() kind!: string;
  @ApiProperty({ enum: ['new', 'seen'] }) status!: string;
  @ApiProperty({ description: 'The head the complaint is about.' })
  headName!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class StaffTodayAppealsDto {
  @ApiProperty({ type: 'integer', description: 'New or seen, not decided.' })
  open!: number;
  @ApiProperty({ type: [StaffTodayAppealDto], description: 'The 3 newest.' })
  newest!: StaffTodayAppealDto[];
}

export class StaffTodayFlagsDto {
  @ApiProperty({ type: 'integer', description: 'Open red marks.' })
  open!: number;
}

export class StaffTodayPersonDto {
  @ApiProperty({ format: 'uuid' }) adminId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['mass', 'finance'] }) workspace!: string;
  @ApiProperty({ type: Number, nullable: true }) rating!: number | null;
  @ApiProperty() status!: string;
  @ApiProperty({ type: [String] }) flags!: string[];
  @ApiProperty({ type: 'integer' }) decisions!: number;
}

export class StaffTodayShortlistDto {
  @ApiProperty({ type: String, nullable: true }) snapshotDate!: string | null;
  @ApiProperty({ type: [StaffTodayPersonDto] }) worst!: StaffTodayPersonDto[];
  @ApiProperty({ type: [StaffTodayPersonDto] }) best!: StaffTodayPersonDto[];
}

export class StaffTodaySuggestionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) adminId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['mass', 'finance'] }) workspace!: string;
  @ApiProperty() kind!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: () => StaffRecommendationDto })
  recommendation!: StaffRecommendationDto;
}

export class StaffTodaySuggestionsDto {
  @ApiProperty({ type: 'integer', description: 'All open ones.' })
  open!: number;
  @ApiProperty({
    type: [StaffTodaySuggestionDto],
    description: 'The 5 most serious.',
  })
  items!: StaffTodaySuggestionDto[];
}

export class StaffTodayAnomalyDto {
  @ApiProperty({ format: 'uuid' }) adminId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() rule!: string;
  @ApiProperty() ruleLabel!: string;
  @ApiProperty({ type: 'integer' }) score!: number;
}

export class StaffTodayAnomaliesDto {
  @ApiProperty({ type: String, nullable: true, description: 'Newest day.' })
  day!: string | null;
  @ApiProperty({ type: 'integer' }) total!: number;
  @ApiProperty({ type: [StaffTodayAnomalyDto] })
  items!: StaffTodayAnomalyDto[];
}

export class StaffTodayPieceworkDto {
  @ApiProperty({
    type: 'integer',
    description: 'Days held in dispute (last 31 days).',
  })
  disputedDays!: number;
}

export class StaffDecisionOfDayDto {
  @ApiProperty() code!: string;
  @ApiProperty() title!: string;
  @ApiProperty() text!: string;
  @ApiProperty({ description: 'Where to decide it (an admin page).' })
  href!: string;
}

export class StaffTodayDto {
  @ApiProperty({ format: 'date-time' }) computedAt!: string;
  @ApiPropertyOptional({
    type: () => StaffDecisionOfDayDto,
    nullable: true,
    description: 'The one most important thing to decide today, or null.',
  })
  decision!: StaffDecisionOfDayDto | null;
  @ApiPropertyOptional({
    type: () => StaffTodayAppealsDto,
    nullable: true,
    description: 'null = its switch is off.',
  })
  appeals!: StaffTodayAppealsDto | null;
  @ApiPropertyOptional({ type: () => StaffTodayFlagsDto, nullable: true })
  flags!: StaffTodayFlagsDto | null;
  @ApiPropertyOptional({ type: () => StaffTodayShortlistDto, nullable: true })
  shortlist!: StaffTodayShortlistDto | null;
  @ApiPropertyOptional({
    type: () => StaffTodaySuggestionsDto,
    nullable: true,
  })
  suggestions!: StaffTodaySuggestionsDto | null;
  @ApiPropertyOptional({ type: () => StaffTodayAnomaliesDto, nullable: true })
  anomalies!: StaffTodayAnomaliesDto | null;
  @ApiPropertyOptional({ type: () => StaffTodayPieceworkDto, nullable: true })
  piecework!: StaffTodayPieceworkDto | null;
}

// ---- GET admin/staff/today/system (owner 2026-10-27) -------------------------

export class StaffSystemActionDto {
  @ApiProperty({
    enum: ['route', 'guide', 'launch', 'url'],
    description:
      'route = admin page, guide = «Инструкции» id, launch = «Запуск» step id (its guide), url = outside link.',
  })
  kind!: string;
  @ApiProperty() target!: string;
  @ApiProperty({ description: 'The button text.' }) label!: string;
}

export class StaffSystemItemDto {
  @ApiProperty({ description: 'Stable: the row disappears when done.' })
  code!: string;
  @ApiProperty({ enum: ['critical', 'high', 'medium', 'low'] })
  severity!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ description: 'One line: why today.' }) why!: string;
  @ApiProperty({ type: () => StaffSystemActionDto })
  action!: StaffSystemActionDto;
}

export class StaffSystemCountsDto {
  @ApiProperty({ type: 'integer' }) critical!: number;
  @ApiProperty({ type: 'integer' }) high!: number;
  @ApiProperty({ type: 'integer' }) medium!: number;
  @ApiProperty({ type: 'integer' }) low!: number;
}

export class StaffSentryIssueDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: 'integer' }) count!: number;
  @ApiProperty({ type: 'integer' }) users!: number;
  @ApiProperty() firstSeen!: string;
  @ApiProperty() lastSeen!: string;
  @ApiProperty() permalink!: string;
}

export class StaffSentrySummaryDto {
  @ApiProperty({
    enum: ['off', 'unconfigured', 'ok', 'error'],
    description:
      'off = switch today.sentry_enabled is off; unconfigured = no sentry keys saved.',
  })
  state!: string;
  @ApiProperty({ type: 'integer' }) unresolved!: number;
  @ApiProperty({ description: 'True when the page was full (100+).' })
  unresolvedAtLeast!: boolean;
  @ApiProperty({ type: 'integer', description: 'First seen in the last 24 h.' })
  newCount!: number;
  @ApiProperty({ type: [StaffSentryIssueDto] }) issues!: StaffSentryIssueDto[];
  @ApiProperty({ type: String, nullable: true }) url!: string | null;
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
  @ApiProperty({ format: 'date-time' }) computedAt!: string;
}

export class StaffTodaySystemDto {
  @ApiProperty({ format: 'date-time' }) computedAt!: string;
  @ApiProperty({
    type: 'integer',
    description: 'The block is refreshed when older than this many seconds.',
  })
  freshSec!: number;
  @ApiProperty({
    type: [StaffSystemItemDto],
    description: 'Ordered by urgency; empty = nothing to do.',
  })
  items!: StaffSystemItemDto[];
  @ApiProperty({ type: () => StaffSystemCountsDto })
  counts!: StaffSystemCountsDto;
  @ApiProperty({ type: () => StaffSentrySummaryDto })
  sentry!: StaffSentrySummaryDto;
}

export class StaffSentryIssueParamDto {
  @ApiProperty({ description: 'Sentry issue id (digits).' })
  @Matches(/^\d{1,20}$/)
  id!: string;
}

// ---- GET admin/staff/digest -------------------------------------------------

export class StaffDigestNumbersDto {
  @ApiProperty({ type: 'integer', description: 'Decisions of the week.' })
  decisions!: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Share of decisions that came back, percent.',
  })
  returnedPct!: number | null;
  @ApiProperty({ type: 'integer', description: 'New complaints about heads.' })
  appeals!: number;
  @ApiProperty({ type: 'integer', description: 'Red + yellow people.' })
  worstCount!: number;
  @ApiProperty({ type: 'integer', description: 'Green people.' })
  bestCount!: number;
  @ApiProperty({ type: String, nullable: true }) worstName!: string | null;
  @ApiProperty({ type: String, nullable: true }) bestName!: string | null;
  @ApiProperty({ type: 'integer', description: 'Piecework pay of the week.' })
  pieceworkCents!: number;
  @ApiProperty() currency!: string;
}

export class StaffDigestDto {
  @ApiProperty({ example: '2026-10-19', description: 'Monday of the week.' })
  weekStart!: string;
  @ApiProperty({ type: () => StaffDigestNumbersDto })
  numbers!: StaffDigestNumbersDto;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class StaffDigestListDto {
  @ApiProperty({ type: [StaffDigestDto], description: 'Newest first, ≤ 8.' })
  items!: StaffDigestDto[];
}

// ---- person card: history ----------------------------------------------------

export class StaffActionRowDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() kind!: string;
  @ApiProperty() source!: string;
  @ApiProperty() reasonCode!: string;
  @ApiProperty({ type: String, nullable: true }) reasonNote!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class StaffSignalCountDto {
  @ApiProperty() kind!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ type: 'integer' }) count!: number;
}

export class StaffOpenRecommendationDto {
  @ApiProperty({ format: 'uuid' }) suggestionId!: string;
  @ApiProperty() kind!: string;
  @ApiProperty({ type: () => StaffRecommendationDto })
  recommendation!: StaffRecommendationDto;
}

export class StaffPersonHistoryDto {
  @ApiProperty({ format: 'uuid' }) adminId!: string;
  @ApiProperty({
    enum: ['active', 'paused', 'hold_owner', 'offboarded'],
    description: 'Where the person stands in the queues.',
  })
  state!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  stateUntil!: string | null;
  @ApiProperty({ type: [StaffSignalCountDto], description: 'Last 30 days.' })
  signals!: StaffSignalCountDto[];
  @ApiProperty({ type: [StaffActionRowDto], description: 'Last 20 actions.' })
  actions!: StaffActionRowDto[];
  @ApiProperty({ type: [StaffOpenRecommendationDto] })
  recommendations!: StaffOpenRecommendationDto[];
}

// ---- POST admin/staff/suggestions/:id/decide ----------------------------------

export class StaffSuggestionParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class StaffAdminParamHomeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  adminId!: string;
}

export class StaffDecideSuggestionDto {
  @ApiProperty({
    enum: ['apply', 'dismiss'],
    description: 'apply = do it (needs a fresh 2FA code); dismiss = not now.',
  })
  @IsIn(['apply', 'dismiss'])
  action!: 'apply' | 'dismiss';

  @ApiPropertyOptional({
    maxLength: 500,
    description: 'Why (kept in the journal).',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class StaffDecideSuggestionResultDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['applied', 'dismissed'] }) status!: string;
  @ApiProperty({
    description: 'What was done, in words (e.g. «Снят с очереди до 3 ноября»).',
  })
  done!: string;
}
