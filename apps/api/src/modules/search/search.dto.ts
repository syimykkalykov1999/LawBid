import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const SEARCH_PERIODS = ['24h', '7d', '30d', 'all'] as const;
export type SearchPeriod = (typeof SEARCH_PERIODS)[number];
export const TAG_SORTS = ['top', 'new'] as const;
export type TagSort = (typeof TAG_SORTS)[number];

class CursorQueryDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

class SearchTextQueryDto extends CursorQueryDto {
  @ApiProperty({ description: 'Search text, at least 2 characters (§7.1).' })
  @IsString()
  @MaxLength(100)
  q!: string;
}

/** GET /search/attorneys (docs/05 §7.3). */
export class SearchAttorneysQueryDto extends SearchTextQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  practiceAreaId?: string;

  @ApiPropertyOptional({ example: 'NY' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  state?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;
}

/** GET /search/people (OQ-026): attorneys and clients, same filters as
 * /search/attorneys (any filter set → attorneys only). */
export class SearchPeopleQueryDto extends SearchAttorneysQueryDto {}

/** GET /search/cases (docs/05 §7.4, attorneys only). */
export class SearchCasesQueryDto extends SearchTextQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  practiceAreaId?: string;

  @ApiPropertyOptional({ example: 'NY' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  state?: string;

  @ApiPropertyOptional({ enum: SEARCH_PERIODS, default: 'all' })
  @IsOptional()
  @IsIn(SEARCH_PERIODS)
  period?: SearchPeriod;
}

/** GET /search/posts (docs/05 §7.5). */
export class SearchPostsQueryDto extends SearchTextQueryDto {}

/** GET /search/tags (docs/05 §7.5). */
export class SearchTagsQueryDto {
  @ApiProperty({ description: 'Hashtag prefix, with or without "#".' })
  @IsString()
  @MaxLength(31)
  q!: string;
}

export class TagParamDto {
  @ApiProperty({ example: 'dui' })
  @IsString()
  @MaxLength(31)
  tag!: string;
}

/** GET /tags/:tag/posts (docs/05 §7.5). */
export class TagPostsQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ enum: TAG_SORTS, default: 'top' })
  @IsOptional()
  @IsIn(TAG_SORTS)
  sort?: TagSort;

  @ApiPropertyOptional({
    example: 'IL',
    description:
      'Only posts of attorneys licensed in this state (newest first).',
  })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  state?: string;
}

export class TagDto {
  @ApiProperty({ description: 'Lowercase, without "#".' })
  tag!: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Posts in the last 7 days (trending only).',
  })
  postsCount!: number | null;
}

export { PersonItemDto, type PeoplePage } from '../follows/follows.dto';

/** GET /search/latest-posts (OQ-034): newest posts by licensed state. */
export class LatestPostsQueryDto extends CursorQueryDto {
  @ApiProperty({ example: 'IL' })
  @IsString()
  @Length(2, 2)
  state!: string;
}
