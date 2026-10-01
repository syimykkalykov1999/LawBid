import { Controller, Get, Param, Query } from '@nestjs/common';
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
  CaseFeedItemDto,
  type CaseFeedPage,
} from '../cases/dto/cases-feed.dto';
import {
  AttorneyListItemDto,
  type AttorneyListPage,
} from '../follows/follows.dto';
import { PostDto, type PostPage } from '../posts/dto/posts.dto';
import {
  type PeoplePage,
  PersonItemDto,
  SearchAttorneysQueryDto,
  SearchCasesQueryDto,
  SearchPeopleQueryDto,
  SearchPostsQueryDto,
  SearchTagsQueryDto,
  TagDto,
  TagParamDto,
  TagPostsQueryDto,
  LatestPostsQueryDto,
} from './search.dto';
import { SearchService } from './search.service';

/** docs/05 §7, §15 "Поиск" (stage 5.6). */
@ApiTags('search')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get('search/attorneys')
  @ApiOperation({ summary: 'Attorneys / people (docs/05 §7.3)' })
  @ApiEnvelopeResponse(AttorneyListItemDto, { isArray: true })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR, ErrorCode.SEARCH_QUERY_TOO_SHORT],
    429: [ErrorCode.RATE_LIMITED],
  })
  attorneys(
    @CurrentUser() user: RequestUser,
    @Query() q: SearchAttorneysQueryDto,
  ): Promise<AttorneyListPage> {
    return this.search.attorneys(user, q);
  }

  @Get('search/people')
  @ApiOperation({
    summary: 'People: attorneys and clients by @username / name (OQ-026)',
  })
  @ApiEnvelopeResponse(PersonItemDto, { isArray: true })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR, ErrorCode.SEARCH_QUERY_TOO_SHORT],
    429: [ErrorCode.RATE_LIMITED],
  })
  people(
    @CurrentUser() user: RequestUser,
    @Query() q: SearchPeopleQueryDto,
  ): Promise<PeoplePage> {
    return this.search.people(user, q);
  }

  @Get('search/cases')
  @ApiOperation({ summary: 'Cases visible to the attorney (docs/05 §7.4)' })
  @ApiEnvelopeResponse(CaseFeedItemDto, { isArray: true })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR, ErrorCode.SEARCH_QUERY_TOO_SHORT],
    403: [ErrorCode.FORBIDDEN],
    429: [ErrorCode.RATE_LIMITED],
  })
  cases(
    @CurrentUser() user: RequestUser,
    @Query() q: SearchCasesQueryDto,
  ): Promise<CaseFeedPage> {
    return this.search.cases(user, q);
  }

  @Get('search/posts')
  @ApiOperation({ summary: 'Posts, full text (docs/05 §7.5)' })
  @ApiEnvelopeResponse(PostDto, { isArray: true })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR, ErrorCode.SEARCH_QUERY_TOO_SHORT],
    429: [ErrorCode.RATE_LIMITED],
  })
  posts(
    @CurrentUser() user: RequestUser,
    @Query() q: SearchPostsQueryDto,
  ): Promise<PostPage> {
    return this.search.postsByText(user, q.q, q.cursor, q);
  }

  @Get('search/tags')
  @ApiOperation({ summary: 'Hashtags by prefix (docs/05 §7.5)' })
  @ApiEnvelopeResponse(TagDto, { isArray: true })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    429: [ErrorCode.RATE_LIMITED],
  })
  tags(
    @CurrentUser() user: RequestUser,
    @Query() q: SearchTagsQueryDto,
  ): Promise<TagDto[]> {
    return this.search.tags(user, q.q);
  }

  @Get('search/trending-tags')
  @ApiOperation({ summary: 'Top hashtags of 7 days (docs/05 §7.2)' })
  @ApiEnvelopeResponse(TagDto, { isArray: true })
  trending(): Promise<TagDto[]> {
    return this.search.trending();
  }

  @Get('tags/:tag/posts')
  @ApiOperation({ summary: 'Posts of a hashtag, top or new (docs/05 §7.5)' })
  @ApiEnvelopeResponse(PostDto, { isArray: true })
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  tagPosts(
    @CurrentUser() user: RequestUser,
    @Param() p: TagParamDto,
    @Query() q: TagPostsQueryDto,
  ): Promise<PostPage> {
    return this.search.tagPosts(
      user,
      p.tag,
      q.sort ?? 'top',
      q.cursor,
      q.state,
    );
  }

  @Get('search/latest-posts')
  @ApiOperation({
    summary:
      'Newest posts, by state (OQ-034), qualification and News (owner 2026-09-30)',
  })
  @ApiEnvelopeResponse(PostDto, { isArray: true })
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  latestPosts(
    @CurrentUser() user: RequestUser,
    @Query() q: LatestPostsQueryDto,
  ): Promise<PostPage> {
    return this.search.latestPosts(user, q.state, q.cursor, {
      practice: q.practice,
      tag: q.tag,
      kind: q.kind,
      period: q.period,
      withPhotos: q.withPhotos,
      sort: q.sort,
    });
  }
}
