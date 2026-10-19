import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** Owner 2026-10-18: the kinds the app reports (a reel 'view' has its own
 * POST /posts/:id/view). */
export const CLIENT_POST_EVENT_KINDS = ['impression', 'profile_visit'] as const;
export type ClientPostEventKind = (typeof CLIENT_POST_EVENT_KINDS)[number];

/** At most this many events in one batch. */
export const POST_EVENTS_BATCH_MAX = 50;

export class PostEventItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  postId!: string;

  @ApiProperty({ enum: CLIENT_POST_EVENT_KINDS })
  @IsIn(CLIENT_POST_EVENT_KINDS)
  kind!: ClientPostEventKind;
}

/** POST /posts/events — impressions of cards seen in a list, profile
 * visits made from a post. */
export class RecordPostEventsDto {
  @ApiProperty({
    type: [PostEventItemDto],
    minItems: 1,
    maxItems: POST_EVENTS_BATCH_MAX,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(POST_EVENTS_BATCH_MAX)
  @ValidateNested({ each: true })
  @Type(() => PostEventItemDto)
  events!: PostEventItemDto[];
}

export class PostInsightsQueryDto {
  /** The viewer's UTC offset in minutes (e.g. 180 for UTC+3): the days of
   * the series are the viewer's local days. */
  @ApiPropertyOptional({ type: 'integer', minimum: -840, maximum: 840 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-840)
  @Max(840)
  tzOffset?: number;
}

export class PostInsightsCountsDto {
  @ApiProperty({ type: 'integer', description: 'Times the card was shown' })
  impressions!: number;

  @ApiProperty({ type: 'integer', description: 'Unique accounts reached' })
  reach!: number;

  @ApiProperty({ type: 'integer', description: 'Video views' })
  views!: number;

  @ApiProperty({ type: 'integer' })
  likes!: number;

  @ApiProperty({ type: 'integer' })
  comments!: number;

  @ApiProperty({ type: 'integer' })
  saves!: number;

  @ApiProperty({ type: 'integer' })
  reposts!: number;

  @ApiProperty({ type: 'integer' })
  shares!: number;

  @ApiProperty({ type: 'integer' })
  profileVisits!: number;
}

export class PostInsightsDayDto extends PostInsightsCountsDto {
  @ApiProperty({ format: 'date', example: '2026-10-18' })
  date!: string;
}

export class PostInsightsDto {
  @ApiProperty({ format: 'uuid' })
  postId!: string;

  @ApiProperty({ format: 'date-time' })
  publishedAt!: string;

  /** All time. */
  @ApiProperty({ type: PostInsightsCountsDto })
  totals!: PostInsightsCountsDto;

  /** likes + comments + saves + reposts + shares, all time. */
  @ApiProperty({ type: 'integer' })
  interactions!: number;

  /** Of [totals.reach]: accounts that follow the author now. */
  @ApiProperty({ type: 'integer' })
  reachFollowers!: number;

  @ApiProperty({ type: 'integer' })
  reachNonFollowers!: number;

  /** One entry per local day, oldest first: the last 30 days, or since the
   * post was published. */
  @ApiProperty({ type: [PostInsightsDayDto] })
  days!: PostInsightsDayDto[];
}
