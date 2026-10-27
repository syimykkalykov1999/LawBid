import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AnonymousCache } from '../../common/cache/http-cache';
import { conditionalGet } from '../../common/sync/cheap-etag';
import { VersionEtagService } from '../../common/sync/version-etag.service';
import { OptionalAuth } from '../auth/decorators/optional-auth.decorator';
import {
  ApiBearerAuth,
  ApiExtension,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PersonItemDto, type PeoplePage } from '../follows/follows.dto';
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';
import { RequireIdempotencyKeyGuard } from '../../idempotency/require-idempotency-key.guard';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import {
  CreatePostDto,
  PostDeletedDto,
  PostDto,
  PinPostDto,
  PostIdParamDto,
  PostsPageQueryDto,
  RepostsQueryDto,
  SavedPostItemDto,
  SavedPostsQueryDto,
  UpdatePostDto,
  PostCountersDto,
  PostCommentsSettingDto,
  type PostPage,
} from './dto/posts.dto';
import { PostEngagementService } from './post-engagement.service';
import { PostInsightsService } from './post-insights.service';
import {
  PostInsightsDto,
  PostInsightsQueryDto,
  RecordPostEventsDto,
} from './dto/post-insights.dto';
import { PostAttachmentsPolicy } from './post-attachments.policy';
import { PostsService } from './posts.service';
import { PostAttachmentsAllowedDto } from './dto/posts.dto';
import { AttorneyOnly } from '../auth/assistant/assistant-context';

const E = ErrorCode;

/** docs/05 §3, §15 "Лента и посты" (stage 5.2). */
@ApiTags('posts')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class PostsController {
  constructor(
    private readonly posts: PostsService,
    private readonly engagement: PostEngagementService,
    private readonly attachmentsPolicy: PostAttachmentsPolicy,
    private readonly insightsService: PostInsightsService,
    private readonly versionEtag: VersionEtagService,
  ) {}

  @Get('posts/attachments-allowed')
  @ApiOperation({
    summary:
      'May this account add documents / extra photos to a post or a reel',
  })
  @ApiEnvelopeResponse(PostAttachmentsAllowedDto)
  async attachmentsAllowed(
    @CurrentUser() user: RequestUser,
  ): Promise<PostAttachmentsAllowedDto> {
    return {
      allowed: await this.attachmentsPolicy.canAttach(user.sub),
      mode: await this.attachmentsPolicy.mode(),
    };
  }

  // OQ-049: or an assistant the attorney trusted (their responsibility).
  @AttorneyOnly('publish')
  @Post('posts')
  @UseGuards(RequireIdempotencyKeyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Publish a post (verified attorney, docs/05 §3.1)' })
  @ApiEnvelopeResponse(PostDto, { status: 201 })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.POST_NOT_ALLOWED],
    404: [E.NOT_FOUND],
    409: [E.FILE_NOT_ATTACHABLE],
    422: [E.CONTENT_BLOCKED],
    429: [E.RATE_LIMITED],
  })
  createPost(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreatePostDto,
  ): Promise<PostDto> {
    return this.posts.create(user, dto);
  }

  @OptionalAuth()
  @Get('posts/:id')
  @ApiOperation({ summary: 'A post (docs/05 §3.5)' })
  @ApiEnvelopeResponse(PostDto)
  @ApiErrors({ 404: [E.POST_NOT_FOUND] })
  async getPost(
    @CurrentUser() user: RequestUser,
    @Param() p: PostIdParamDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PostDto | undefined> {
    // Owner 2026-10-25 (S2-12): a version tag computed before the queries;
    // a match is a 304 (the post must still be visible to this viewer).
    return conditionalGet(
      req,
      res,
      await this.versionEtag.post(user.sub, p.id),
      () => this.posts.assertVisible(user, p.id),
      () => this.posts.get(user, p.id),
    );
  }

  // OQ-049: or an assistant the attorney trusted (their responsibility).
  @AttorneyOnly('publish')
  @Patch('posts/:id')
  @ApiOperation({
    summary: 'Edit the title, text or qualification of an own post',
  })
  @ApiEnvelopeResponse(PostDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.POST_NOT_FOUND],
    422: [E.CONTENT_BLOCKED],
  })
  updatePost(
    @CurrentUser() user: RequestUser,
    @Param() p: PostIdParamDto,
    @Body() dto: UpdatePostDto,
  ): Promise<PostDto> {
    return this.posts.update(user, p.id, dto);
  }

  // Owner 2026-10-15: every author (clients post too) switches their own
  // counters, like Instagram's "Hide like count".
  @Patch('posts/:id/counters')
  @ApiOperation({
    summary: 'Hide or show the like / view counter of an own post',
  })
  @ApiEnvelopeResponse(PostDto)
  @ApiErrors({ 404: [E.POST_NOT_FOUND] })
  setPostCounters(
    @CurrentUser() user: RequestUser,
    @Param() p: PostIdParamDto,
    @Body() dto: PostCountersDto,
  ): Promise<PostDto> {
    return this.posts.setCounters(user, p.id, dto);
  }

  // Owner 2026-10-18: every author (attorney, client; an assistant with the
  // "publish" duty for the attorney) turns comments of an own post on / off.
  @AttorneyOnly('publish')
  @Patch('posts/:id/comments-setting')
  @ApiOperation({
    summary:
      'Turn comments of an own post on / off (off: no new comments or replies, the existing ones are hidden)',
  })
  @ApiEnvelopeResponse(PostDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.POST_NOT_FOUND] })
  setPostComments(
    @CurrentUser() user: RequestUser,
    @Param() p: PostIdParamDto,
    @Body() dto: PostCommentsSettingDto,
  ): Promise<PostDto> {
    return this.posts.setCommentsEnabled(user, p.id, dto.enabled);
  }

  // Owner 2026-10-18: «Архивировать» — hidden from everyone but the author.
  @AttorneyOnly('publish')
  @Post('posts/:id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive an own post (idempotent)' })
  @ApiEnvelopeResponse(PostDto)
  @ApiErrors({ 404: [E.POST_NOT_FOUND], 409: [E.VIDEO_NOT_READY] })
  archivePost(
    @CurrentUser() user: RequestUser,
    @Param() p: PostIdParamDto,
  ): Promise<PostDto> {
    return this.posts.archive(user, p.id);
  }

  // Owner 2026-10-18: «Показать в профиле» — back by its publish date.
  @AttorneyOnly('publish')
  @Delete('posts/:id/archive')
  @ApiOperation({ summary: 'Show an archived own post in the profile again' })
  @ApiEnvelopeResponse(PostDto)
  @ApiErrors({ 404: [E.POST_NOT_FOUND] })
  unarchivePost(
    @CurrentUser() user: RequestUser,
    @Param() p: PostIdParamDto,
  ): Promise<PostDto> {
    return this.posts.unarchive(user, p.id);
  }

  @AttorneyOnly('publish')
  @Get('me/archived-posts')
  @ApiOperation({
    summary: 'My archived posts, newest archived first (Settings → «Архив»)',
  })
  @ApiEnvelopeResponse(PostDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listArchivedPosts(
    @CurrentUser() user: RequestUser,
    @Query() q: RepostsQueryDto,
  ): Promise<PostPage> {
    return this.posts.listArchived(user, q);
  }

  // OQ-048: publications are the attorney's — an assistant never deletes.
  @AttorneyOnly()
  @Delete('posts/:id')
  @ApiOperation({ summary: 'Delete an own post (soft, docs/05 §3.3)' })
  @ApiEnvelopeResponse(PostDeletedDto)
  @ApiErrors({ 404: [E.POST_NOT_FOUND] })
  deletePost(
    @CurrentUser() user: RequestUser,
    @Param() p: PostIdParamDto,
  ): Promise<{ deleted: true }> {
    return this.posts.remove(user, p.id);
  }

  // Owner 2026-10-12: pin an own post (slot 1..3) to the top of the profile.
  @AttorneyOnly('publish')
  @Post('posts/:id/pin')
  @ApiOperation({ summary: 'Pin an own post to slot 1, 2 or 3' })
  @ApiEnvelopeResponse(PostDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.POST_NOT_FOUND] })
  pinPost(
    @CurrentUser() user: RequestUser,
    @Param() p: PostIdParamDto,
    @Body() dto: PinPostDto,
  ): Promise<PostDto> {
    return this.posts.pin(user, p.id, dto.slot);
  }

  @AttorneyOnly('publish')
  @Delete('posts/:id/pin')
  @ApiOperation({ summary: 'Unpin an own post' })
  @ApiEnvelopeResponse(PostDto)
  @ApiErrors({ 404: [E.POST_NOT_FOUND] })
  unpinPost(
    @CurrentUser() user: RequestUser,
    @Param() p: PostIdParamDto,
  ): Promise<PostDto> {
    return this.posts.unpin(user, p.id);
  }

  @OptionalAuth()
  @AnonymousCache(30)
  @Get('attorneys/:id/posts')
  @ApiOperation({ summary: "An attorney's posts, newest first (docs/05 §15)" })
  @ApiEnvelopeResponse(PostDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listAttorneyPosts(
    @CurrentUser() user: RequestUser,
    @Param() p: PostIdParamDto,
    @Query() q: PostsPageQueryDto,
  ): Promise<PostPage> {
    return this.posts.listByAttorney(user, p.id, q);
  }

  @Post('posts/:id/like')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Like a post (idempotent, docs/05 §4)' })
  @ApiErrors({ 404: [E.POST_NOT_FOUND], 429: [E.RATE_LIMITED] })
  likePost(
    @CurrentUser() user: RequestUser,
    @Param() p: PostIdParamDto,
  ): Promise<void> {
    return this.engagement.like(user.sub, p.id);
  }

  @Post('posts/:id/share')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Count a completed share (OQ-037)' })
  @ApiErrors({ 404: [E.POST_NOT_FOUND], 429: [E.RATE_LIMITED] })
  sharePost(
    @CurrentUser() user: RequestUser,
    @Param() p: PostIdParamDto,
  ): Promise<void> {
    return this.engagement.share(user.sub, p.id);
  }

  // Owner 2026-10-22 (client economy plan, package A): kept for older
  // apps; new apps batch views through POST /posts/events (kind 'view').
  @Post('posts/:id/view')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Count a view of a video post / reel (idempotent, one per viewer)',
    description:
      'Deprecated (owner 2026-10-22): send kind "view" in POST /posts/events instead — one request for many posts.',
    deprecated: true,
  })
  @ApiExtension('x-sunset', '2027-06-30')
  @ApiErrors({ 404: [E.POST_NOT_FOUND] })
  viewPost(
    @CurrentUser() user: RequestUser,
    @Param() p: PostIdParamDto,
  ): Promise<void> {
    return this.engagement.view(user.sub, p.id);
  }

  // Owner 2026-10-18: impressions of cards the viewer saw in a list (≥ 50 %
  // on screen for about a second) and profile visits made from a post, in
  // batches; one per viewer + post + kind per 24 h, never the author's own.
  @Post('posts/events')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Record post impressions / views / profile visits (batch)',
    description:
      'Owner 2026-10-22: kind "view" (a post or reel seen ≥ 50 % for ≥ 1 s) counts like POST /posts/:id/view — once per viewer per 24 h, never the author. Send up to 50 events per request.',
  })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  recordPostEvents(
    @CurrentUser() user: RequestUser,
    @Body() dto: RecordPostEventsDto,
  ): Promise<void> {
    return this.insightsService.record(user, dto.events);
  }

  // Owner 2026-10-18 (Instagram Insights): the author only — an assistant
  // with the "posts" duty for the attorney; anyone else 404 (403 for an
  // assistant without the duty).
  @AttorneyOnly('posts')
  @Get('posts/:id/insights')
  @ApiOperation({
    summary:
      'Statistics of an own post: totals and the last 30 days by day (author only)',
  })
  @ApiEnvelopeResponse(PostInsightsDto)
  @ApiErrors({ 403: [E.ASSISTANT_NOT_ALLOWED], 404: [E.POST_NOT_FOUND] })
  postInsights(
    @CurrentUser() user: RequestUser,
    @Param() p: PostIdParamDto,
    @Query() q: PostInsightsQueryDto,
  ): Promise<PostInsightsDto> {
    return this.insightsService.insights(user, p.id, q.tzOffset ?? 0);
  }

  @Delete('posts/:id/like')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a like (idempotent, docs/05 §4)' })
  unlikePost(
    @CurrentUser() user: RequestUser,
    @Param() p: PostIdParamDto,
  ): Promise<void> {
    return this.engagement.unlike(user.sub, p.id);
  }

  @Post('posts/:id/repost')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Repost a post, Threads-style (idempotent, owner 2026-10-07)',
  })
  @ApiErrors({
    403: [E.USER_BLOCKED],
    404: [E.POST_NOT_FOUND],
    409: [E.REPOST_OWN_POST],
    429: [E.RATE_LIMITED],
  })
  repostPost(
    @CurrentUser() user: RequestUser,
    @Param() p: PostIdParamDto,
  ): Promise<void> {
    return this.engagement.repost(user.sub, p.id);
  }

  @Delete('posts/:id/repost')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Undo a repost (idempotent, owner 2026-10-07)' })
  unrepostPost(
    @CurrentUser() user: RequestUser,
    @Param() p: PostIdParamDto,
  ): Promise<void> {
    return this.engagement.unrepost(user.sub, p.id);
  }

  @Get('posts/:id/likes')
  @ApiOperation({
    summary: 'Who liked a post, newest first (owner 2026-10-20)',
  })
  @ApiEnvelopeResponse(PersonItemDto, { isArray: true })
  @ApiErrors({ 403: [E.USER_BLOCKED], 404: [E.POST_NOT_FOUND] })
  listLikers(
    @CurrentUser() user: RequestUser,
    @Param() p: PostIdParamDto,
    @Query() q: RepostsQueryDto,
  ): Promise<PeoplePage> {
    return this.engagement.listLikers(user.sub, p.id, q.cursor);
  }

  @Get('posts/:id/reposts')
  @ApiOperation({
    summary: 'Who reposted a post, newest first (owner 2026-10-18)',
  })
  @ApiEnvelopeResponse(PersonItemDto, { isArray: true })
  @ApiErrors({ 403: [E.USER_BLOCKED], 404: [E.POST_NOT_FOUND] })
  listReposters(
    @CurrentUser() user: RequestUser,
    @Param() p: PostIdParamDto,
    @Query() q: RepostsQueryDto,
  ): Promise<PeoplePage> {
    return this.engagement.listReposters(user.sub, p.id, q.cursor);
  }

  @Get('users/:id/reposts')
  @ApiOperation({
    summary: "A user's Reposts profile tab, newest first (owner 2026-10-18)",
  })
  @ApiEnvelopeResponse(PostDto, { isArray: true })
  @ApiErrors({ 403: [E.USER_BLOCKED], 404: [E.NOT_FOUND] })
  listUserReposts(
    @CurrentUser() user: RequestUser,
    @Param() p: PostIdParamDto,
    @Query() q: RepostsQueryDto,
  ): Promise<PostPage> {
    return this.engagement.listUserReposts(user.sub, p.id, q.cursor);
  }

  @Get('saved-items/posts')
  @ApiOperation({ summary: 'Saved posts (docs/05 §4, "Моё → Сохранённое")' })
  @ApiEnvelopeResponse(SavedPostItemDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listSavedPosts(
    @CurrentUser() user: RequestUser,
    @Query() q: SavedPostsQueryDto,
  ): Promise<{ items: SavedPostItemDto[]; nextCursor: string | null }> {
    return this.engagement.listSaved(user.sub, q.cursor);
  }
}
