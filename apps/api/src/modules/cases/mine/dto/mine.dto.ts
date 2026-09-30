import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { CaseStatus, ConversationStatus, FeeType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BidDto, BidOfferDto } from '../../../bids/dto/bid-responses.dto';
import { CaseBidItemDto } from '../../case-bids/dto/case-bids.dto';
import { CaseFeedItemDto } from '../../dto/cases-feed.dto';
import { CaseDto, CasePhotoDto } from '../../dto/case-responses.dto';

export const MINE_PAGE_DEFAULT = 20;
export const MINE_PAGE_MAX = 50;

class PageQuery {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MINE_PAGE_MAX,
    default: MINE_PAGE_DEFAULT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MINE_PAGE_MAX)
  limit?: number;
}

export const MY_BIDS_FILTERS = ['active', 'finished'] as const;
export type MyBidsFilter = (typeof MY_BIDS_FILTERS)[number];

/** GET /users/me/bids (docs/04 §11.2 "Мои биды", §15). */
export class ListMyBidsQueryDto extends PageQuery {
  @ApiPropertyOptional({ enum: MY_BIDS_FILTERS, default: 'active' })
  @IsOptional()
  @IsIn(MY_BIDS_FILTERS)
  filter?: MyBidsFilter;
}

export const MY_WORK_FILTERS = ['active', 'closed'] as const;
export type MyWorkFilter = (typeof MY_WORK_FILTERS)[number];

/** GET /users/me/work (docs/04 §11.2 "В работе" / "Завершённые"). */
export class ListMyWorkQueryDto extends PageQuery {
  @ApiPropertyOptional({ enum: MY_WORK_FILTERS, default: 'active' })
  @IsOptional()
  @IsIn(MY_WORK_FILTERS)
  filter?: MyWorkFilter;
}

/** GET /saved-items (docs/04 §11.2 "Сохранённое": cases). */
export class ListSavedCasesQueryDto extends PageQuery {
  @ApiProperty({ enum: ['case'], description: 'Posts arrive with docs/05.' })
  @IsIn(['case'])
  type!: 'case';
}

export class MineCaseIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class BidCaseRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: CaseStatus, enumName: 'CaseStatus' })
  status!: CaseStatus;

  @ApiProperty()
  primaryStateCode!: string;

  @ApiProperty()
  practiceAreaNameEn!: string;

  @ApiProperty()
  practiceAreaI18nKey!: string;
}

/** A "Мои биды" row: the bid, its case ("Re: …") and its last offer. */
export class MyBidItemDto extends OmitType(BidDto, ['offers'] as const) {
  @ApiProperty({ type: BidCaseRefDto })
  case!: BidCaseRefDto;

  @ApiProperty({ type: BidOfferDto })
  lastOffer!: BidOfferDto;
}

/** A "В работе" row (docs/04 §11.2). */
export class WorkItemDto {
  @ApiProperty({ format: 'uuid' })
  caseId!: string;

  @ApiProperty({ format: 'uuid' })
  bidId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: CaseStatus, enumName: 'CaseStatus' })
  status!: CaseStatus;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Client name; null while the subscription is inactive (contacts are locked, §8.3).',
  })
  clientName!: string | null;

  @ApiProperty({ enum: FeeType, enumName: 'FeeType' })
  feeType!: FeeType;

  @ApiProperty({ type: 'integer' })
  amountCents!: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  autoCloseAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  acceptedAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  closedAt!: string | null;
}

export class SavedCaseItemDto {
  @ApiProperty({ format: 'uuid' })
  caseId!: string;

  @ApiProperty()
  savedAt!: string;

  @ApiProperty({
    description: 'false → "Кейс недоступен" (closed or no longer visible).',
  })
  available!: boolean;

  @ApiPropertyOptional({ type: String, nullable: true })
  title!: string | null;

  @ApiPropertyOptional({ type: CaseFeedItemDto, nullable: true })
  case!: CaseFeedItemDto | null;
}

/** GET /users/me/cases/:id — the owner's case (docs/04 §11.1): the case
 * plus "Адвокат в работе" once a bid is accepted. */
export class OwnerCaseDetailDto extends CaseDto {
  @ApiPropertyOptional({ type: CaseBidItemDto, nullable: true })
  acceptedBid!: CaseBidItemDto | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Chat with the accepted attorney (docs/05).',
  })
  conversationId!: string | null;

  /** OQ-031: the case photos (owner always sees them). */
  @ApiProperty({ type: [CasePhotoDto] })
  photos!: CasePhotoDto[];
}

export class CaseConversationDto {
  @ApiProperty({ format: 'uuid' })
  conversationId!: string;

  @ApiProperty({ enum: ConversationStatus, enumName: 'ConversationStatus' })
  status!: ConversationStatus;

  @ApiProperty()
  contactsUnlocked!: boolean;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
