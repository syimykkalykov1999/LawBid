import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { AnonymousCache } from '../../common/cache/http-cache';
import { OptionalAuth } from '../auth/decorators/optional-auth.decorator';
import { Throttle } from '@nestjs/throttler';
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
  SearchClickDto,
  SearchPeopleQueryDto,
  SearchPostsQueryDto,
  SearchTagsQueryDto,
  PracticeMatchDto,
  SuggestionDto,
  TagDto,
  TagParamDto,
  TagPostsQueryDto,
  LatestPostsQueryDto,
} from './search.dto';
import { SearchLogService } from './search-log.service';
import { SearchService } from './search.service';

/** docs/05 §7, §15 "Поиск" (stage 5.6). */
@ApiTags('search')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class SearchController {
  constructor(
    private readonly search: SearchService,
    private readonly searchLog: SearchLogService,
  ) {}

  // Security research #5 (2026-10-22), A5: a full-text / ranked query over
  // the whole table; 30 a minute per person is a human searching, not a
  // script pulling the catalog.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @OptionalAuth()
  @AnonymousCache(30)
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

  @OptionalAuth()
  @AnonymousCache(30)
  @Get('search/suggest')
  @ApiOperation({ summary: 'Type-ahead: topics, handles, practices by prefix' })
  @ApiEnvelopeResponse(SuggestionDto, { isArray: true })
  @ApiErrors({ 429: [ErrorCode.RATE_LIMITED] })
  suggest(
    @CurrentUser() user: RequestUser,
    @Query() q: SearchTagsQueryDto,
  ): Promise<SuggestionDto[]> {
    return this.search.suggest(user, q.q);
  }

  @OptionalAuth()
  @AnonymousCache(60)
  @Get('search/practices')
  @ApiOperation({
    summary: 'Practices whose name in any language starts with the query',
  })
  @ApiEnvelopeResponse(PracticeMatchDto, { isArray: true })
  @ApiErrors({ 429: [ErrorCode.RATE_LIMITED] })
  practices(
    @CurrentUser() user: RequestUser,
    @Query() q: SearchTagsQueryDto,
  ): Promise<PracticeMatchDto[]> {
    return this.search.practices(user, q.q);
  }

  // Security research #5 (2026-10-22), A5: a full-text / ranked query over
  // the whole table; 30 a minute per person is a human searching, not a
  // script pulling the catalog.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
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

  // Security research #5 (2026-10-22), A5: a full-text / ranked query over
  // the whole table; 30 a minute per person is a human searching, not a
  // script pulling the catalog.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
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

  // Security research #5 (2026-10-22), A5: a full-text / ranked query over
  // the whole table; 30 a minute per person is a human searching, not a
  // script pulling the catalog.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @OptionalAuth()
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

  // Security research #5 (2026-10-22), A5: a full-text / ranked query over
  // the whole table; 30 a minute per person is a human searching, not a
  // script pulling the catalog.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @OptionalAuth()
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

  @OptionalAuth()
  @Get('search/trending-tags')
  @ApiOperation({ summary: 'Top hashtags of 7 days (docs/05 §7.2)' })
  @ApiEnvelopeResponse(TagDto, { isArray: true })
  trending(): Promise<TagDto[]> {
    return this.search.trending();
  }

  // Security research #5 (2026-10-22), A5: a full-text / ranked query over
  // the whole table; 30 a minute per person is a human searching, not a
  // script pulling the catalog.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @OptionalAuth()
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
      q.videoOnly,
    );
  }

  @Post('search/clicks')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'A result opened after a query (owner 2026-10-15): the search learns topics from these',
  })
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  async click(
    @CurrentUser() user: RequestUser,
    @Body() dto: SearchClickDto,
  ): Promise<void> {
    await this.searchLog.recordClick(
      user.sub,
      dto.q,
      dto.targetType,
      dto.targetId,
    );
  }

  // Security research #5 (2026-10-22), A5: a full-text / ranked query over
  // the whole table; 30 a minute per person is a human searching, not a
  // script pulling the catalog.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @OptionalAuth()
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
      states: splitList(q.states)?.map((c) => c.toUpperCase()),
      practices: splitList(q.practices),
      practice: q.practice,
      tag: q.tag,
      kind: q.kind,
      period: q.period,
      withPhotos: q.withPhotos,
      briefsOnly: q.briefsOnly,
      sort: q.sort,
      contentClass: q.contentClass,
    });
  }
}

/** "IL,NY" → ['IL', 'NY'] (validated by the DTO); absent → undefined. */
function splitList(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  const items = [...new Set(raw.split(',').filter(Boolean))];
  return items.length ? items : undefined;
}
