import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BudgetMode, CaseStatus, SavedItemType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
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
 * A case card in the attorney feed (docs/04 §4.2). Never carries any
 * client field (name/photo/phone/email) — the client is not part of this
 * representation at all, by construction, not by filtering.
 */
export class CaseFeedItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

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
}

/** GET /cases/:id for an attorney (docs/04 §4.3): the feed item plus the
 * description and whether it is currently in the attorney's saved items.
 * Still no client field. */
export class CaseDetailForAttorneyDto extends CaseFeedItemDto {
  @ApiProperty()
  description!: string;

  @ApiProperty()
  isSaved!: boolean;
}

export interface CaseFeedPage {
  items: CaseFeedItemDto[];
  nextCursor: string | null;
}
