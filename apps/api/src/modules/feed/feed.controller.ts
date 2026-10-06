import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import {
  ContentFilterService,
  FEED_CONTENT_MODES,
  type FeedContentMode,
} from '../posts/content-filter.service';
import { PostDto, type PostPage } from '../posts/dto/posts.dto';
import { FeedService } from './feed.service';

/** §2.2.5: limit 10–20. */
export class FeedQueryDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 10, maximum: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(20)
  limit?: number;
}

/** Owner 2026-10-05: which posts the feed, search and recommendations
 * show — every post, or only legal ones (general posts hidden). */
export class FeedPreferencesDto {
  @ApiProperty({ enum: FEED_CONTENT_MODES, enumName: 'FeedContentMode' })
  @IsIn(FEED_CONTENT_MODES)
  contentMode!: FeedContentMode;
}

@ApiTags('feed')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('feed')
export class FeedController {
  constructor(
    private readonly feed: FeedService,
    private readonly contentFilter: ContentFilterService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Feed: followed + recommended posts (docs/05 §2.2)',
  })
  @ApiEnvelopeResponse(PostDto, { isArray: true })
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  getFeed(
    @CurrentUser() user: RequestUser,
    @Query() q: FeedQueryDto,
  ): Promise<PostPage> {
    return this.feed.page(user, q.cursor, q.limit ?? 20);
  }

  @Get('preferences')
  @ApiOperation({
    summary: 'My feed content: every post or legal posts only',
  })
  @ApiEnvelopeResponse(FeedPreferencesDto)
  async getPreferences(
    @CurrentUser() user: RequestUser,
  ): Promise<FeedPreferencesDto> {
    return { contentMode: await this.contentFilter.modeOf(user.sub) };
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Show every post or legal posts only' })
  @ApiEnvelopeResponse(FeedPreferencesDto)
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  async setPreferences(
    @CurrentUser() user: RequestUser,
    @Body() dto: FeedPreferencesDto,
  ): Promise<FeedPreferencesDto> {
    return {
      contentMode: await this.contentFilter.setMode(user.sub, dto.contentMode),
    };
  }
}
