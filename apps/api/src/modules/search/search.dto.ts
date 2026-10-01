import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
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

/** GET /search/people (OQ-026): attorneys and clients. Practice, rating
 * and language are attorney-only filters (set → attorneys only); state
 * matches an attorney's license or a client's state (OQ-036). */
export class SearchPeopleQueryDto extends SearchAttorneysQueryDto {
  @ApiPropertyOptional({ enum: ['attorney', 'client'] })
  @IsOptional()
  @IsIn(['attorney', 'client'])
  role?: 'attorney' | 'client';

  @ApiPropertyOptional({
    description: 'Only people with the check mark (verified).',
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
  verifiedOnly?: boolean;
}

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

  // OQ-036: the Cases filter of the Search tab.
  @ApiPropertyOptional({ example: 'family_law' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_]{2,64}$/)
  practiceCategory?: string;

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
}

export const POST_SORTS = ['relevance', 'newest', 'popular'] as const;
export type PostSort = (typeof POST_SORTS)[number];

/** GET /search/posts (docs/05 §7.5; filters OQ-036). */
export class SearchPostsQueryDto extends SearchTextQueryDto {
  @ApiPropertyOptional({ description: 'Only posts with this hashtag (topic).' })
  @IsOptional()
  @IsString()
  @Matches(/^[\p{L}\p{N}_]{1,30}$/u)
  tag?: string;

  @ApiPropertyOptional({
    example: 'IL',
    description: 'Only posts of attorneys licensed in this state.',
  })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  state?: string;

  @ApiPropertyOptional({ enum: SEARCH_PERIODS, default: 'all' })
  @IsOptional()
  @IsIn(SEARCH_PERIODS)
  period?: SearchPeriod;

  @ApiPropertyOptional({ description: 'Only posts with photos.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === true || value === 'true'
      ? true
      : value === false || value === 'false'
        ? false
        : value,
  )
  @IsBoolean()
  withPhotos?: boolean;

  @ApiPropertyOptional({ enum: POST_SORTS, default: 'relevance' })
  @IsOptional()
  @IsIn(POST_SORTS)
  sort?: PostSort;
}

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

/** GET /search/latest-posts (OQ-034): newest posts, optionally only of
 * attorneys licensed in a state (the Search tab's "explore" grid uses it
 * without a state). */
export class LatestPostsQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ example: 'IL' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  state?: string;

  /** Owner 2026-09-30: a practice category or subcategory code; a
   * category includes its subcategories. */
  @ApiPropertyOptional({ example: 'civil_litigation' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  practice?: string;

  /** Older posts without a qualification match by their topic hashtag. */
  @ApiPropertyOptional({ example: 'civillitigation' })
  @IsOptional()
  @IsString()
  @MaxLength(31)
  tag?: string;

  /** Owner 2026-09-30: only News (or only regular posts). */
  @ApiPropertyOptional({ enum: ['post', 'news'], enumName: 'PostKind' })
  @IsOptional()
  @IsIn(['post', 'news'])
  kind?: 'post' | 'news';
}
