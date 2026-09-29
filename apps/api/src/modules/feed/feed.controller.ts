import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
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

@ApiTags('feed')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('feed')
export class FeedController {
  constructor(private readonly feed: FeedService) {}

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
}
