import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  AttorneyIdParamDto,
  AttorneyListItemDto,
  FollowsQueryDto,
  type AttorneyListPage,
  type PeoplePage,
  PersonItemDto,
} from './follows.dto';
import { FollowsService } from './follows.service';

const E = ErrorCode;

/** docs/05 §6, §15 "Подписки" (stage 5.5). */
@ApiTags('follows')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  @Post('attorneys/:id/follow')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Follow an attorney (idempotent, docs/05 §6.1)' })
  @ApiErrors({
    404: [E.NOT_FOUND],
    422: [E.FOLLOW_NOT_ALLOWED],
    429: [E.RATE_LIMITED],
  })
  followAttorney(
    @CurrentUser() user: RequestUser,
    @Param() p: AttorneyIdParamDto,
  ): Promise<void> {
    return this.follows.follow(user, p.id);
  }

  @Delete('attorneys/:id/follow')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unfollow (idempotent)' })
  unfollowAttorney(
    @CurrentUser() user: RequestUser,
    @Param() p: AttorneyIdParamDto,
  ): Promise<void> {
    return this.follows.unfollow(user, p.id);
  }

  @Get('attorneys/:id/followers')
  @ApiOperation({
    summary: 'Attorney followers — attorneys and clients (OQ-026)',
  })
  @ApiEnvelopeResponse(PersonItemDto, { isArray: true })
  listFollowers(
    @CurrentUser() user: RequestUser,
    @Param() p: AttorneyIdParamDto,
    @Query() q: FollowsQueryDto,
  ): Promise<PeoplePage> {
    return this.follows.followers(user.sub, p.id, q.cursor);
  }

  @Get('attorneys/:id/following')
  @ApiOperation({ summary: 'Attorneys an attorney follows (docs/05 §6.2)' })
  @ApiEnvelopeResponse(AttorneyListItemDto, { isArray: true })
  listFollowing(
    @CurrentUser() user: RequestUser,
    @Param() p: AttorneyIdParamDto,
    @Query() q: FollowsQueryDto,
  ): Promise<AttorneyListPage> {
    return this.follows.following(user.sub, p.id, q.cursor);
  }

  @Get('users/me/following')
  @ApiOperation({ summary: 'My follows (docs/05 §6.2)' })
  @ApiEnvelopeResponse(AttorneyListItemDto, { isArray: true })
  listMyFollowing(
    @CurrentUser() user: RequestUser,
    @Query() q: FollowsQueryDto,
  ): Promise<AttorneyListPage> {
    return this.follows.mine(user.sub, q.cursor);
  }

  @Get('suggestions/attorneys')
  @ApiOperation({ summary: 'Recommended attorneys (docs/05 §6.3)' })
  @ApiEnvelopeResponse(AttorneyListItemDto, { isArray: true })
  listSuggestedAttorneys(
    @CurrentUser() user: RequestUser,
    @Query() q: FollowsQueryDto,
  ): Promise<AttorneyListPage> {
    return this.follows.suggestions(user, q.cursor);
  }
}
