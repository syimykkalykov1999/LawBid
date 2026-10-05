import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  BidAttorneySummaryDto,
  BidDto,
} from '../../../bids/dto/bid-responses.dto';

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

export { BidAttorneySummaryDto };

/** One card of the client's bid list: the bid's current terms (the full
 * offer history is GET /bids/:id) plus the attorney summary. */
export class CaseBidItemDto extends OmitType(BidDto, [
  'offers',
  'attorney',
] as const) {
  @ApiProperty({ type: BidAttorneySummaryDto })
  attorney!: BidAttorneySummaryDto;
}

export interface CaseBidPage {
  items: CaseBidItemDto[];
  nextCursor: string | null;
}
