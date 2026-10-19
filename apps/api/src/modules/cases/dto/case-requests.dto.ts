import { MineFilterFields } from '../mine/mine-filters';
import { CASE_COVER_RE } from '../domain/case-cover';
import {
  CASE_DEADLINE_KINDS,
  CASE_URGENCIES,
  type CaseDeadlineKind,
  type CaseUrgency,
} from '../domain/case-urgency';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BudgetMode } from '@prisma/client';
import { PERCENT_BPS_MAX, PERCENT_BPS_MIN } from '../domain/contingency';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { tidy } from '../../../common/utils/tidy-text';
import { MaxTextChars } from '../../../common/app-settings/max-text-chars.decorator';

// docs/04_CASES_BIDS.md §3.2.
export const TITLE_MIN = 10;
export const TITLE_MAX = 120;
export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 5000;
export const CITY_MAX = 80;
export const BUDGET_MIN_DOLLARS = 1;
export const BUDGET_MAX_DOLLARS = 10_000_000;
export const MAX_ADDITIONAL_STATES = 2;

export const MY_CASES_PAGE_DEFAULT = 20;
export const MY_CASES_PAGE_MAX = 50;

const STATE_CODE_RE = /^[A-Z0-9]{2}$/;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const trimToNull = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export class CaseIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

/** POST /cases (docs/04 §3.1–§3.4). Budget is entered in whole dollars and
 * stored in cents (service multiplies by 100; .cursorrules "Деньги только
 * в центах"). `clientContactSharingConsent` only needs to be `true` when
 * the client hasn't granted that consent before (§3.1 step 5 — the app
 * shows the checkbox only for a client's first case, but the gate itself
 * is "not yet granted", not "first case"). */
/** OQ-031: photos per case — hard ceiling; the live count is the admin's
 * «Загрузки и файлы» (bug 17, default 9). */
export const MAX_CASE_PHOTOS = 20;

export class CreateCaseDto {
  @ApiProperty({ format: 'uuid', description: 'A leaf (specialization).' })
  @IsUUID('all')
  practiceAreaId!: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      'Topics 2..N (leaves); at most `case.max_practices` in all with the first.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsUUID('all', { each: true })
  extraPracticeAreaIds?: string[];

  @ApiProperty({ minLength: TITLE_MIN, maxLength: TITLE_MAX })
  @Transform(trim)
  @IsString()
  @MinLength(TITLE_MIN)
  @MaxTextChars('limits.case_title_chars')
  title!: string;

  @ApiProperty({ minLength: DESCRIPTION_MIN, maxLength: DESCRIPTION_MAX })
  @Transform(tidy)
  @IsString()
  @MinLength(DESCRIPTION_MIN)
  @MaxTextChars('limits.case_description_chars')
  description!: string;

  @ApiPropertyOptional({
    maxLength: 50_000,
    description:
      'Owner 2026-10-18: private details; only the owner and the accepted attorney read them.',
  })
  @IsOptional()
  @Transform(tidy)
  @IsString()
  @MaxTextChars('limits.case_private_details_chars')
  privateDetails?: string;

  @ApiProperty({ pattern: '^[A-Z0-9]{2}$', example: 'NY' })
  @IsString()
  @Matches(STATE_CODE_RE)
  primaryStateCode!: string;

  @ApiPropertyOptional({
    type: [String],
    maxItems: MAX_ADDITIONAL_STATES,
    description: '0-2 more states, distinct from the primary and each other.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ADDITIONAL_STATES)
  @ArrayUnique()
  @Matches(STATE_CODE_RE, { each: true })
  additionalStateCodes?: string[];

  @ApiPropertyOptional({ maxLength: CITY_MAX, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(CITY_MAX)
  city?: string | null;

  @ApiProperty({ enum: BudgetMode, enumName: 'BudgetMode' })
  @IsEnum(BudgetMode)
  budgetMode!: BudgetMode;

  /** Owner 2026-09-30 (OQ-031): 0–9 clean `case_photo` file ids, in
   * display order. Seen only by the owner and the accepted attorney. */
  @ApiPropertyOptional({
    type: [String],
    maxItems: MAX_CASE_PHOTOS,
    description: 'Clean case_photo file ids (0-9), display order.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CASE_PHOTOS)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  photoFileIds?: string[];

  @ApiPropertyOptional({
    type: 'integer',
    minimum: BUDGET_MIN_DOLLARS,
    maximum: BUDGET_MAX_DOLLARS,
    description: 'Required (and only meaningful) when budgetMode = amount.',
  })
  @ValidateIf((o: CreateCaseDto) => o.budgetMode === 'amount')
  @IsInt()
  @Min(BUDGET_MIN_DOLLARS)
  @Max(BUDGET_MAX_DOLLARS)
  budgetAmountDollars?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: PERCENT_BPS_MIN,
    maximum: PERCENT_BPS_MAX,
    description:
      'Owner 2026-10-17: required when budgetMode = percent; basis points (3300 = 33 %). Capped by `fees.contingency_max_percent`.',
  })
  @ValidateIf((o: CreateCaseDto) => o.budgetMode === 'percent')
  @IsInt()
  @Min(PERCENT_BPS_MIN)
  @Max(PERCENT_BPS_MAX)
  budgetPercentBps?: number;

  @ApiPropertyOptional({
    description:
      'Must be true unless the client already granted client_contact_sharing on an earlier case.',
  })
  @IsOptional()
  @IsBoolean()
  clientContactSharingConsent?: boolean;
  /** Owner 2026-10-04: an app cover variant or icon avatar for the card
   * (never a personal photo). Null/absent = picked from the case id. */
  @ApiPropertyOptional({
    nullable: true,
    pattern: '^(art:[0-3]|icon:[a-z_]{2,32})$',
    example: 'art:2',
    description: '`art:0`-`art:3` (practice cover variant) or `icon:<name>`.',
  })
  @IsOptional()
  @IsString()
  @Matches(CASE_COVER_RE)
  coverKey?: string | null;

  /** Owner 2026-10-04/05: how soon the client needs an attorney — a
   * level, or `by_date` with deadlineAt (a date alone means `by_date`).
   * A level clears the date; null clears both. */
  @ApiPropertyOptional({
    enum: CASE_URGENCIES,
    enumName: 'CaseUrgency',
    nullable: true,
  })
  @IsOptional()
  @IsIn(CASE_URGENCIES)
  urgency?: CaseUrgency | null;

  /** Owner 2026-10-05: the date it is needed by (today … 2 years). */
  @ApiPropertyOptional({
    type: String,
    format: 'date',
    nullable: true,
    example: '2026-11-03',
  })
  @IsOptional()
  // A date, or an ISO date-time whose date part is used (the generated
  // Dart client sends DateTime.toIso8601String()).
  @Matches(/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/)
  deadlineAt?: string | null;

  /** Owner 2026-10-05: what the date is; only with a date. */
  @ApiPropertyOptional({
    enum: CASE_DEADLINE_KINDS,
    enumName: 'CaseDeadlineKind',
    nullable: true,
  })
  @IsOptional()
  @IsIn(CASE_DEADLINE_KINDS)
  deadlineKind?: CaseDeadlineKind | null;
}

/** PATCH /cases/:id (docs/04 §3.5). Every field is optional; at least one
 * must be sent. practiceAreaId / states are only accepted while the case
 * has no bids (CasesService checks bids_count, not this DTO). Changing
 * states means sending the full desired set (primary + additional), not a
 * partial patch of one state. */
export class UpdateCaseDto {
  @ApiPropertyOptional({ minLength: TITLE_MIN, maxLength: TITLE_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(TITLE_MIN)
  @MaxTextChars('limits.case_title_chars')
  title?: string;

  @ApiPropertyOptional({
    minLength: DESCRIPTION_MIN,
    maxLength: DESCRIPTION_MAX,
  })
  @IsOptional()
  @Transform(tidy)
  @IsString()
  @MinLength(DESCRIPTION_MIN)
  @MaxTextChars('limits.case_description_chars')
  description?: string;

  @ApiPropertyOptional({
    maxLength: 50_000,
    description: 'Private details; an empty string clears them.',
  })
  @IsOptional()
  @Transform(tidy)
  @IsString()
  @MaxTextChars('limits.case_private_details_chars')
  privateDetails?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'A leaf (specialization).',
  })
  @IsOptional()
  @IsUUID('all')
  practiceAreaId?: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      'Topics 2..N (leaves); at most `case.max_practices` in all with the first.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsUUID('all', { each: true })
  extraPracticeAreaIds?: string[];

  @ApiPropertyOptional({ pattern: '^[A-Z0-9]{2}$', example: 'NY' })
  @IsOptional()
  @IsString()
  @Matches(STATE_CODE_RE)
  primaryStateCode?: string;

  @ApiPropertyOptional({ type: [String], maxItems: MAX_ADDITIONAL_STATES })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ADDITIONAL_STATES)
  @ArrayUnique()
  @Matches(STATE_CODE_RE, { each: true })
  additionalStateCodes?: string[];

  @ApiPropertyOptional({ maxLength: CITY_MAX, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(CITY_MAX)
  city?: string | null;

  @ApiPropertyOptional({ enum: BudgetMode, enumName: 'BudgetMode' })
  @IsOptional()
  @IsEnum(BudgetMode)
  budgetMode?: BudgetMode;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: BUDGET_MIN_DOLLARS,
    maximum: BUDGET_MAX_DOLLARS,
  })
  @ValidateIf((o: UpdateCaseDto) => o.budgetMode === 'amount')
  @IsInt()
  @Min(BUDGET_MIN_DOLLARS)
  @Max(BUDGET_MAX_DOLLARS)
  budgetAmountDollars?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: PERCENT_BPS_MIN,
    maximum: PERCENT_BPS_MAX,
    description:
      'Owner 2026-10-17: required when budgetMode = percent; basis points (3300 = 33 %). Capped by `fees.contingency_max_percent`.',
  })
  @ValidateIf((o: UpdateCaseDto) => o.budgetMode === 'percent')
  @IsInt()
  @Min(PERCENT_BPS_MIN)
  @Max(PERCENT_BPS_MAX)
  budgetPercentBps?: number;
  /** Owner 2026-10-04: an app cover variant or icon avatar for the card
   * (never a personal photo). Null/absent = picked from the case id. */
  @ApiPropertyOptional({
    nullable: true,
    pattern: '^(art:[0-3]|icon:[a-z_]{2,32})$',
    example: 'art:2',
    description: '`art:0`-`art:3` (practice cover variant) or `icon:<name>`.',
  })
  @IsOptional()
  @IsString()
  @Matches(CASE_COVER_RE)
  coverKey?: string | null;

  /** Owner 2026-10-04/05: how soon the client needs an attorney — a
   * level, or `by_date` with deadlineAt (a date alone means `by_date`).
   * A level clears the date; null clears both. */
  @ApiPropertyOptional({
    enum: CASE_URGENCIES,
    enumName: 'CaseUrgency',
    nullable: true,
  })
  @IsOptional()
  @IsIn(CASE_URGENCIES)
  urgency?: CaseUrgency | null;

  /** Owner 2026-10-05: the date it is needed by (today … 2 years). */
  @ApiPropertyOptional({
    type: String,
    format: 'date',
    nullable: true,
    example: '2026-11-03',
  })
  @IsOptional()
  // A date, or an ISO date-time whose date part is used (the generated
  // Dart client sends DateTime.toIso8601String()).
  @Matches(/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/)
  deadlineAt?: string | null;

  /** Owner 2026-10-05: what the date is; only with a date. */
  @ApiPropertyOptional({
    enum: CASE_DEADLINE_KINDS,
    enumName: 'CaseDeadlineKind',
    nullable: true,
  })
  @IsOptional()
  @IsIn(CASE_DEADLINE_KINDS)
  deadlineKind?: CaseDeadlineKind | null;

  /** Owner 2026-10-05: the full desired set of the case's photos and
   * documents (0–9, display order) — so a client can complete the dossier
   * after publishing. Absent = unchanged. */
  @ApiPropertyOptional({
    type: [String],
    maxItems: MAX_CASE_PHOTOS,
    description:
      'Full set of clean case_photo / case_attachment file ids (0-9), display order.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CASE_PHOTOS)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  photoFileIds?: string[];
}

// Owner 2026-09-30: `open` and `in_progress` split the old `active`
// for the Mine tabs; `active` stays for older app builds.
// Owner 2026-10-15: `completed` = closed + archived (one «Completed» chip).
export type MyCasesFilter =
  'active' | 'open' | 'in_progress' | 'archived' | 'closed' | 'completed';
export const MY_CASES_FILTERS: readonly MyCasesFilter[] = [
  'active',
  'open',
  'in_progress',
  'archived',
  'closed',
  'completed',
];

/** GET /users/me/cases (docs/04 §11.1, §15). */
export class ListMyCasesQueryDto extends MineFilterFields {
  @ApiPropertyOptional({ enum: MY_CASES_FILTERS, default: 'active' })
  @IsOptional()
  @IsIn(MY_CASES_FILTERS)
  filter?: MyCasesFilter;

  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: MY_CASES_PAGE_MAX,
    default: MY_CASES_PAGE_DEFAULT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MY_CASES_PAGE_MAX)
  limit?: number;
}

export const STILL_NEEDED_ANSWERS = [
  'still_needed',
  'wait_better',
  'not_needed',
  'make_not_urgent',
] as const;
export type StillNeededAnswer = (typeof STILL_NEEDED_ANSWERS)[number];

/** POST /cases/:id/still-needed (OQ-054): the answer to «Вам ещё нужен
 * адвокат?». `make_not_urgent` is only accepted for an urgent / very urgent
 * case older than 7 days. */
export class StillNeededAnswerDto {
  @ApiProperty({
    enum: STILL_NEEDED_ANSWERS,
    enumName: 'StillNeededAnswer',
    description:
      '«Да, нужен» / «Жду предложений получше» / «Уже не нужен» (closes the case) / «Сменить на «Не срочно»».',
  })
  @IsIn(STILL_NEEDED_ANSWERS)
  answer!: StillNeededAnswer;
}

/** PATCH /cases/:id/urgency (owner 2026-10-05): the urgency or the date
 * alone — also after an attorney is hired (a court date moves), by the
 * client or by the hired attorney; the other side is told. */
export class UpdateCaseUrgencyDto {
  /** Owner 2026-10-04/05: how soon the client needs an attorney — a
   * level, or `by_date` with deadlineAt (a date alone means `by_date`).
   * A level clears the date; null clears both. */
  @ApiPropertyOptional({
    enum: CASE_URGENCIES,
    enumName: 'CaseUrgency',
    nullable: true,
  })
  @IsOptional()
  @IsIn(CASE_URGENCIES)
  urgency?: CaseUrgency | null;

  /** Owner 2026-10-05: the date it is needed by (today … 2 years). */
  @ApiPropertyOptional({
    type: String,
    format: 'date',
    nullable: true,
    example: '2026-11-03',
  })
  @IsOptional()
  // A date, or an ISO date-time whose date part is used (the generated
  // Dart client sends DateTime.toIso8601String()).
  @Matches(/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/)
  deadlineAt?: string | null;

  /** Owner 2026-10-05: what the date is; only with a date. */
  @ApiPropertyOptional({
    enum: CASE_DEADLINE_KINDS,
    enumName: 'CaseDeadlineKind',
    nullable: true,
  })
  @IsOptional()
  @IsIn(CASE_DEADLINE_KINDS)
  deadlineKind?: CaseDeadlineKind | null;
}

/** Audit 2026-10-19: «Подробности» (private details) can be changed after
 * a bid is accepted too; an empty text clears them. */
export class UpdatePrivateDetailsDto {
  @ApiProperty({
    maxLength: 50_000,
    description:
      'Only the owner and the accepted attorney read them; empty clears.',
  })
  @Transform(tidy)
  @IsString()
  @MaxTextChars('limits.case_private_details_chars')
  privateDetails!: string;
}
