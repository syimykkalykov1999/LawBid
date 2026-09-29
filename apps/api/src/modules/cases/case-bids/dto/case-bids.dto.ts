import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { BidDto } from '../../../bids/dto/bid-responses.dto';
import { RatingDto } from '../../../profiles/dto/attorney-profile.dto';

/** docs/04 §5.2 sort orders of the client's bid list. */
export const CASE_BIDS_SORTS = [
  'newest',
  'lowest_price',
  'highest_rating',
] as const;
export type CaseBidsSort = (typeof CASE_BIDS_SORTS)[number];

export const CASE_BIDS_PAGE_DEFAULT = 20;
export const CASE_BIDS_PAGE_MAX = 50;

/** GET /cases/:id/bids?sort=&cursor=&limit= */
export class CaseBidsQueryDto {
  @ApiPropertyOptional({ enum: CASE_BIDS_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(CASE_BIDS_SORTS)
  sort?: CaseBidsSort;

  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: CASE_BIDS_PAGE_MAX,
    default: CASE_BIDS_PAGE_DEFAULT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CASE_BIDS_PAGE_MAX)
  limit?: number;
}

/** The bidding attorney as the client sees them on a bid card (docs/04
 * §5.2: photo, name, blue check, rating and review count). Public profile
 * content only (docs/03 §6) — never bar numbers or documents. */
export class BidAttorneySummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Signed link to the 256 px avatar; null when none.',
  })
  avatarUrl256!: string | null;

  @ApiProperty({ description: 'Blue check (docs/03 §6.3).' })
  verifiedBadge!: boolean;

  @ApiProperty({ type: RatingDto })
  rating!: RatingDto;
}

/** One card of the client's bid list: the bid's current terms (the full
 * offer history is GET /bids/:id) plus the attorney summary. */
export class CaseBidItemDto extends OmitType(BidDto, ['offers'] as const) {
  @ApiProperty({ type: BidAttorneySummaryDto })
  attorney!: BidAttorneySummaryDto;
}

export interface CaseBidPage {
  items: CaseBidItemDto[];
  nextCursor: string | null;
}
