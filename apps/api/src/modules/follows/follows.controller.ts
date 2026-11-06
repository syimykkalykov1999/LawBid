import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { conditionalGet } from '../../common/sync/cheap-etag';
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
  FollowStateDto,
  PeopleListQueryDto,
  SuggestionsQueryDto,
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

  // Owner 2026-10-22 (client economy plan, package D): both answers carry
  // {following, followersCount} (200) so the app edits the profile row
  // locally; older apps ignore the body.
  @Post('attorneys/:id/follow')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Follow an attorney (idempotent, docs/05 §6.1)' })
  @ApiEnvelopeResponse(FollowStateDto)
  @ApiErrors({
    404: [E.NOT_FOUND],
    422: [E.FOLLOW_NOT_ALLOWED],
    429: [E.RATE_LIMITED],
  })
  followAttorney(
    @CurrentUser() user: RequestUser,
    @Param() p: AttorneyIdParamDto,
  ): Promise<FollowStateDto> {
    return this.follows.follow(user, p.id);
  }

  @Delete('attorneys/:id/follow')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unfollow (idempotent)' })
  @ApiEnvelopeResponse(FollowStateDto)
  unfollowAttorney(
    @CurrentUser() user: RequestUser,
    @Param() p: AttorneyIdParamDto,
  ): Promise<FollowStateDto> {
    return this.follows.unfollow(user, p.id);
  }

  @Get('attorneys/:id/followers')
  @ApiOperation({
    summary: 'Attorney followers — attorneys and clients (OQ-026)',
  })
  @ApiEnvelopeResponse(PersonItemDto, { isArray: true })
  async listFollowers(
    @CurrentUser() user: RequestUser,
    @Param() p: AttorneyIdParamDto,
    @Query() q: PeopleListQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PeoplePage | undefined> {
    // R-385: the first page is a cheap 304 when the list did not change.
    return conditionalGet(
      req,
      res,
      q.cursor || q.q
        ? null
        : await this.follows.listTag(user.sub, p.id, 'followers'),
      () => this.follows.assertListable(p.id),
      () => this.follows.followers(user.sub, p.id, q.cursor, q.q),
    );
  }

  @Get('attorneys/:id/following')
  @ApiOperation({
    summary: 'Whom a user follows — attorneys and clients (OQ-038)',
  })
  @ApiEnvelopeResponse(PersonItemDto, { isArray: true })
  async listFollowing(
    @CurrentUser() user: RequestUser,
    @Param() p: AttorneyIdParamDto,
    @Query() q: PeopleListQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PeoplePage | undefined> {
    return conditionalGet(
      req,
      res,
      q.cursor || q.q
        ? null
        : await this.follows.listTag(user.sub, p.id, 'following'),
      () => this.follows.assertListable(p.id),
      () => this.follows.following(user.sub, p.id, q.cursor, q.q),
    );
  }

  @Get('users/me/following')
  @ApiOperation({ summary: 'My follows (docs/05 §6.2)' })
  @ApiEnvelopeResponse(AttorneyListItemDto, { isArray: true })
  async listMyFollowing(
    @CurrentUser() user: RequestUser,
    @Query() q: PeopleListQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AttorneyListPage | undefined> {
    return conditionalGet(
      req,
      res,
      q.cursor || q.q
        ? null
        : await this.follows.listTag(user.sub, null, 'following'),
      () => Promise.resolve(),
      () => this.follows.mine(user.sub, q.cursor, q.q),
    );
  }

  @Get('suggestions/attorneys')
  @ApiOperation({ summary: 'Recommended attorneys (docs/05 §6.3)' })
  @ApiEnvelopeResponse(AttorneyListItemDto, { isArray: true })
  listSuggestedAttorneys(
    @CurrentUser() user: RequestUser,
    @Query() q: SuggestionsQueryDto,
  ): Promise<AttorneyListPage> {
    return this.follows.suggestions(user, q.cursor, q.limit);
  }
}
