import {
  CASE_DEADLINE_KINDS,
  CASE_MIN_URGENCIES,
  CASE_URGENCIES,
  CASE_URGENCY_LEVELS,
  type CaseDeadlineKind,
  type CaseMinUrgency,
  type CaseUrgency,
  type CaseUrgencyLevel,
} from '../domain/case-urgency';
import { CasePhotoDto } from './case-responses.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BudgetMode, CaseStatus, SavedItemType } from '@prisma/client';
import { Type, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** docs/04 §4.2: attorney "Cases" tab is a cursor-paginated list. */
export const CASES_FEED_PAGE_DEFAULT = 20;
export const CASES_FEED_PAGE_MAX = 50;

/** A case is tagged NEW on its card for this long after creation (§4.2). */
export const CASE_NEW_BADGE_HOURS = 24;

export class CaseIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

/** GET /cases (docs/04 §4.2, §15): attorney feed, filtered to the
 * attorney's own chosen practices/licensed states per the UI (§4.2
 * "Фильтры: практика (из своих выбранных), штат (из своих лицензий)") —
 * the service does not validate that the value belongs to the caller, it
 * just narrows the §5.4 query further (a filter outside the attorney's
 * own set only ever yields an empty page). */
export class ListCasesFeedQueryDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: CASES_FEED_PAGE_MAX,
    default: CASES_FEED_PAGE_DEFAULT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CASES_FEED_PAGE_MAX)
  limit?: number;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Leaf practice area id.',
  })
  @IsOptional()
  @IsUUID('all')
  practiceAreaId?: string;

  @ApiPropertyOptional({ example: 'NJ', description: 'Two-letter state code.' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  state?: string;

  @ApiPropertyOptional({
    example: 'NJ,NY',
    description:
      'Owner 2026-10-06: several states at once (comma-separated) — cases in any of them; joins `state` when both are sent.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  @Matches(/^[A-Za-z]{2}(,[A-Za-z]{2}){0,59}$/)
  states?: string;

  @ApiPropertyOptional({
    enum: ['licensed', 'all'],
    default: 'licensed',
    description:
      'Owner 2026-10-04: "licensed" = cases in states with a verified licence (default); "all" = browse open cases of own practices in every state (view only).',
  })
  @IsOptional()
  @IsIn(['licensed', 'all'])
  scope?: 'licensed' | 'all';

  @ApiPropertyOptional({
    example: 'family_law',
    description:
      'Practice category code: cases of any of its leaves (owner 2026-09-30, OQ-034 topic slider).',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_]{2,64}$/)
  practiceCategory?: string;

  @ApiPropertyOptional({
    example: 'civil_litigation.arbitration_and_mediation_representation',
    description:
      "Owner 2026-09-30: any qualification (category with its subcategories, or one subcategory) — every open case of it in the attorney's licensed states, own practices or not.",
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_.]{2,120}$/)
  practice?: string;

  // Audit 2026-10-01: the Search tab's case filters, applied on the server
  // (the explore grid used to filter one page in the app).
  @ApiPropertyOptional({ enum: ['24h', '7d', '30d', 'all'], default: 'all' })
  @IsOptional()
  @IsIn(['24h', '7d', '30d', 'all'])
  period?: '24h' | '7d' | '30d' | 'all';

  @ApiPropertyOptional({ minimum: 0, description: 'Whole dollars.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  budgetMin?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Whole dollars.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  budgetMax?: number;

  @ApiPropertyOptional({ description: 'Only cases with "clarify later".' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === true || value === 'true'
      ? true
      : value === false || value === 'false'
        ? false
        : value,
  )
  @IsBoolean()
  budgetUnknown?: boolean;

  @ApiPropertyOptional({ description: 'Only cases nobody has bid on yet.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === true || value === 'true'
      ? true
      : value === false || value === 'false'
        ? false
        : value,
  )
  @IsBoolean()
  noBids?: boolean;

  @ApiPropertyOptional({
    enum: CASE_MIN_URGENCIES,
    enumName: 'MinUrgency',
    description:
      'Owner 2026-10-05: only cases at least this urgent today (a dated case by its days left; past dates excluded).',
  })
  @IsOptional()
  @IsIn(CASE_MIN_URGENCIES)
  minUrgency?: CaseMinUrgency;

  @ApiPropertyOptional({
    description:
      'Owner 2026-10-05: only cases with a date (court hearing, filing deadline…) still ahead.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === true || value === 'true'
      ? true
      : value === false || value === 'false'
        ? false
        : value,
  )
  @IsBoolean()
  hasDeadline?: boolean;
}

/** POST/DELETE /saved-items (docs/04 §4.3, §11.2, §15). Only itemType
 * 'case' is implemented in stage 4.3; 'post' arrives with file 05. */
export class SavedItemDto {
  @ApiProperty({ enum: SavedItemType, enumName: 'SavedItemType' })
  @IsEnum(SavedItemType)
  itemType!: SavedItemType;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  itemId!: string;
}

/** Category + leaf specialization of a case's practice area (docs/04
 * §4.2 "цветная шапка с названием категории", §4.3 "категория и
 * специализация"). Mirrors profiles/dto/practice-areas.dto.ts's shape. */
export class CasePracticeAreaDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'traffic_tickets.speeding' })
  code!: string;

  @ApiProperty({ example: 'practice.traffic_tickets.speeding' })
  i18nKey!: string;

  @ApiProperty()
  nameEn!: string;

  @ApiProperty({ format: 'uuid' })
  categoryId!: string;

  @ApiProperty({ example: 'traffic_tickets' })
  categoryCode!: string;

  @ApiProperty({ example: 'practice.traffic_tickets' })
  categoryI18nKey!: string;

  @ApiProperty()
  categoryNameEn!: string;
}

export class CaseBudgetDto {
  @ApiProperty({ enum: BudgetMode, enumName: 'BudgetMode' })
  @IsEnum(BudgetMode)
  mode!: BudgetMode;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  amountCents!: number | null;
}

/**
 * Owner 2026-10-05: what the client has put into the case, so an attorney
 * can judge it before bidding. Counts and lengths only — the files
 * themselves still open to the accepted attorney alone (OQ-031).
 */
export class CaseDossierDto {
  @ApiProperty({ type: 'integer', description: 'Attached photos (image/*).' })
  imagesCount!: number;

  @ApiProperty({
    type: 'integer',
    description: 'Attached documents (PDF, Word…).',
  })
  documentsCount!: number;

  @ApiProperty({
    type: 'integer',
    description: 'Length of the full description, in characters.',
  })
  descriptionLength!: number;
}

/**
 * A case card in the attorney feed (docs/04 §4.2). Never carries any
 * client field (name/photo/phone/email) — the client is not part of this
 * representation at all, by construction, not by filtering.
 */
export class CaseFeedItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  /** Owner 2026-09-30: first ~180 characters of the description. */
  @ApiProperty()
  excerpt!: string;

  @ApiProperty({ type: CasePracticeAreaDto })
  practiceArea!: CasePracticeAreaDto;

  @ApiProperty({ example: 'NJ' })
  primaryStateCode!: string;

  @ApiProperty({ type: [String], example: ['NY'] })
  additionalStateCodes!: string[];

  @ApiPropertyOptional({ type: String, nullable: true })
  city!: string | null;

  @ApiProperty({ enum: CaseStatus, enumName: 'CaseStatus' })
  status!: CaseStatus;

  @ApiProperty({ type: CaseBudgetDto })
  budget!: CaseBudgetDto;

  /** Owner 2026-10-04: `art:0..3` / `icon:<name>`; null = from the id. */
  @ApiPropertyOptional({ type: String, nullable: true, example: 'art:2' })
  coverKey?: string | null;

  /** Owner 2026-10-04/05: the client's choice — a level, or `by_date`
   * (see deadlineAt); null when not set. */
  @ApiPropertyOptional({
    enum: CASE_URGENCIES,
    enumName: 'CaseUrgency',
    nullable: true,
  })
  urgency?: CaseUrgency | null;

  /** Owner 2026-10-05: the level the case reads as today (a dated case's
   * level follows from the days left; `overdue` once the date passed). */
  @ApiPropertyOptional({
    enum: CASE_URGENCY_LEVELS,
    enumName: 'CaseUrgencyLevel',
    nullable: true,
  })
  urgencyLevel?: CaseUrgencyLevel | null;

  /** Owner 2026-10-05: the date the client needs it by (YYYY-MM-DD). */
  @ApiPropertyOptional({
    type: String,
    format: 'date',
    nullable: true,
    example: '2026-11-03',
  })
  deadlineAt?: string | null;

  /** Owner 2026-10-05: what the date is (court hearing, filing…). */
  @ApiPropertyOptional({
    enum: CASE_DEADLINE_KINDS,
    enumName: 'CaseDeadlineKind',
    nullable: true,
  })
  deadlineKind?: CaseDeadlineKind | null;

  @ApiProperty({ type: 'integer' })
  viewCount!: number;

  @ApiProperty({ type: 'integer' })
  bidsCount!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ description: 'Younger than CASE_NEW_BADGE_HOURS (§4.2).' })
  isNew!: boolean;

  @ApiProperty({ description: '"Вы сделали бид" (§4.2/§4.3).' })
  hasOwnBid!: boolean;

  /** Owner 2026-09-30 (OQ-034): the case card works like a post card. */
  @ApiProperty({ type: 'integer' })
  commentCount!: number;

  /** OQ-037. */
  @ApiProperty({ type: 'integer' })
  shareCount!: number;

  @ApiProperty({ description: "In the viewer's saved items." })
  isSaved!: boolean;

  /** Owner 2026-10-02: a running paid case promotion ("Promoted" badge). */
  @ApiProperty({ description: 'Promoted by its client right now.' })
  promoted!: boolean;

  @ApiProperty({
    description:
      "Owner 2026-10-05: the client's plan puts the case first in the feed (shown on top of the first page).",
  })
  priorityClient!: boolean;
  /** Owner 2026-10-05: how complete the case is (counts only). */
  @ApiProperty({ type: CaseDossierDto })
  dossier!: CaseDossierDto;
}

/** GET /cases/:id for an attorney (docs/04 §4.3): the feed item plus the
 * description and whether it is currently in the attorney's saved items.
 * Still no client field. */
export class CaseDetailForAttorneyDto extends CaseFeedItemDto {
  @ApiProperty()
  description!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'The attorney\'s own bid on this case (§4.3: shown instead of "Сделать бид").',
  })
  ownBidId!: string | null;

  @ApiProperty({
    description:
      "True when this attorney's bid is the case's accepted one (the hired lawyer: open the work screen).",
  })
  acceptedBidIsMine!: boolean;

  @ApiPropertyOptional({
    enum: ['client', 'attorney'],
    nullable: true,
    description:
      'Owner 2026-10-02: who marked "Done" first while the case waits for the other side (null otherwise).',
  })
  completionRequestedBy!: 'client' | 'attorney' | null;

  /** OQ-031: photos — only when THIS attorney's bid was accepted. */
  @ApiProperty({ type: [CasePhotoDto] })
  photos!: CasePhotoDto[];

  /** OQ-031: how many photos the case has (shown to every attorney). */
  @ApiProperty()
  photosCount!: number;

  /** Owner 2026-09-30: the case's practice is one of this attorney's —
   * otherwise "Bid" warns that the client will be told. */
  @ApiProperty()
  inMyPractice!: boolean;

  /** Owner 2026-10-04: the attorney holds a verified licence in one of
   * the case's states — otherwise "Bid" notes that the client will see it. */
  @ApiProperty()
  inMyLicensedStates!: boolean;

  @ApiProperty({
    description:
      'Owner 2026-10-04: an attorney may bid on any open case (any state, any practice); kept for older apps, always true.',
  })
  bidAllowed!: boolean;
}

export interface CaseFeedPage {
  items: CaseFeedItemDto[];
  nextCursor: string | null;
}
