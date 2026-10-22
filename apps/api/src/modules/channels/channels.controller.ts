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
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
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
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';
import { RequireIdempotencyKeyGuard } from '../../idempotency/require-idempotency-key.guard';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { CreateVideoUploadDto, VideoUploadDto } from '../videos/videos.dto';
import {
  AddChannelAdminDto,
  ChannelAdminDto,
  ChannelAdminParamDto,
  ChannelCommentDto,
  ChannelCommentParamDto,
  ChannelDto,
  ChannelIdParamDto,
  ChannelListQueryDto,
  ChannelPageQueryDto,
  ChannelPostDto,
  ChannelPostParamDto,
  ChannelReactionDto,
  ChannelRefParamDto,
  ChannelSubscriptionDto,
  ChannelViewsDto,
  CreateChannelCommentDto,
  CreateChannelDto,
  CreateChannelPostDto,
  UpdateChannelDto,
  UpdateChannelPostDto,
  UpdateChannelSubscriptionDto,
} from './channels.dto';
import { ChannelsService, type ChannelPage } from './channels.service';
import {
  AttorneyOnly,
  RequiresDuty,
} from '../auth/assistant/assistant-context';

const E = ErrorCode;

/** Owner 2026-10-20 — Telegram-style channels. */
@ApiTags('channels')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
// Owner 2026-10-22 (security audit #3): channels live in the Chats tab — an
// assistant reaches them in the attorney's name only with the "chats"
// duty. Broadcasting (a channel, its posts, admins, comments) speaks
// publicly for the attorney, so it also needs the "publish" duty, the same
// as posts and comments (OQ-049).
@RequiresDuty('chats')
@Controller('channels')
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Get()
  @ApiOperation({
    summary: 'Channels: discover / search, the ones I follow, the ones I run',
  })
  @ApiEnvelopeResponse(ChannelDto, { isArray: true })
  @ApiErrors({ 403: [E.FEATURE_DISABLED] })
  channelList(
    @CurrentUser() user: RequestUser,
    @Query() q: ChannelListQueryDto,
  ): Promise<ChannelPage<ChannelDto>> {
    return this.channels.list(user, q.scope, q.q, q.cursor, q.archived);
  }

  @AttorneyOnly('publish')
  @Post()
  @ApiOperation({
    summary: 'Create a channel (verified attorneys and clients)',
  })
  @ApiEnvelopeResponse(ChannelDto, { status: 201 })
  @ApiErrors({
    403: [E.POST_NOT_ALLOWED, E.FEATURE_DISABLED],
    409: [E.CHANNEL_USERNAME_TAKEN, E.CHANNEL_LIMIT_REACHED],
    429: [E.RATE_LIMITED],
  })
  channelCreate(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateChannelDto,
  ): Promise<ChannelDto> {
    return this.channels.create(user, dto);
  }

  @AttorneyOnly('publish')
  @Post('video-uploads')
  @ApiOperation({ summary: 'Start a direct upload of a channel post video' })
  @ApiEnvelopeResponse(VideoUploadDto, { status: 201 })
  @ApiErrors({
    403: [E.VIDEO_UNAVAILABLE, E.POST_NOT_ALLOWED],
    409: [E.VIDEO_NOT_READY],
    422: [E.VIDEO_TOO_LONG],
    429: [E.RATE_LIMITED],
    503: [E.VIDEO_UNAVAILABLE],
  })
  channelCreateVideoUpload(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateVideoUploadDto,
  ): Promise<VideoUploadDto> {
    return this.channels.createVideoUpload(user, dto);
  }

  @Get(':ref')
  @ApiOperation({ summary: 'A channel by id or @username' })
  @ApiEnvelopeResponse(ChannelDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  channelGet(
    @CurrentUser() user: RequestUser,
    @Param() p: ChannelRefParamDto,
  ): Promise<ChannelDto> {
    return this.channels.get(user, p.ref);
  }

  @AttorneyOnly('publish')
  @Patch(':id')
  @ApiOperation({ summary: 'Edit a channel (admins; @username: owner)' })
  @ApiEnvelopeResponse(ChannelDto)
  @ApiErrors({
    403: [E.FORBIDDEN],
    404: [E.NOT_FOUND],
    409: [E.CHANNEL_USERNAME_TAKEN],
  })
  channelUpdate(
    @CurrentUser() user: RequestUser,
    @Param() p: ChannelIdParamDto,
    @Body() dto: UpdateChannelDto,
  ): Promise<ChannelDto> {
    return this.channels.update(user, p.id, dto);
  }

  @AttorneyOnly('publish')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a channel (owner)' })
  @ApiErrors({ 403: [E.FORBIDDEN], 404: [E.NOT_FOUND] })
  channelRemove(
    @CurrentUser() user: RequestUser,
    @Param() p: ChannelIdParamDto,
  ): Promise<void> {
    return this.channels.remove(user, p.id);
  }

  @Put(':id/subscription')
  @ApiOperation({ summary: 'Subscribe' })
  @ApiEnvelopeResponse(ChannelSubscriptionDto)
  @ApiErrors({ 403: [E.USER_BLOCKED], 404: [E.NOT_FOUND] })
  channelSubscribe(
    @CurrentUser() user: RequestUser,
    @Param() p: ChannelIdParamDto,
  ): Promise<ChannelSubscriptionDto> {
    return this.channels.subscribe(user, p.id);
  }

  @Delete(':id/subscription')
  @ApiOperation({ summary: 'Unsubscribe' })
  @ApiEnvelopeResponse(ChannelSubscriptionDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  channelUnsubscribe(
    @CurrentUser() user: RequestUser,
    @Param() p: ChannelIdParamDto,
  ): Promise<ChannelSubscriptionDto> {
    return this.channels.unsubscribe(user, p.id);
  }

  @Patch(':id/subscription')
  @ApiOperation({
    summary: 'My mute (timed or forever), pin and Archive of a channel',
  })
  @ApiEnvelopeResponse(ChannelSubscriptionDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  channelMute(
    @CurrentUser() user: RequestUser,
    @Param() p: ChannelIdParamDto,
    @Body() dto: UpdateChannelSubscriptionDto,
  ): Promise<ChannelSubscriptionDto> {
    return this.channels.mute(user, p.id, dto);
  }

  @Get(':id/admins')
  @ApiOperation({ summary: 'Owner and admins of a channel (admins only)' })
  @ApiEnvelopeResponse(ChannelAdminDto, { isArray: true })
  @ApiErrors({ 403: [E.FORBIDDEN], 404: [E.NOT_FOUND] })
  channelAdmins(
    @CurrentUser() user: RequestUser,
    @Param() p: ChannelIdParamDto,
  ): Promise<ChannelAdminDto[]> {
    return this.channels.admins(user, p.id);
  }

  @AttorneyOnly('publish')
  @Post(':id/admins')
  @ApiOperation({ summary: 'Add an admin by @username (owner)' })
  @ApiEnvelopeResponse(ChannelAdminDto, { isArray: true, status: 201 })
  @ApiErrors({
    403: [E.FORBIDDEN, E.POST_NOT_ALLOWED, E.USER_BLOCKED],
    404: [E.NOT_FOUND],
    409: [E.CHANNEL_LIMIT_REACHED],
  })
  channelAddAdmin(
    @CurrentUser() user: RequestUser,
    @Param() p: ChannelIdParamDto,
    @Body() dto: AddChannelAdminDto,
  ): Promise<ChannelAdminDto[]> {
    return this.channels.addAdmin(user, p.id, dto);
  }

  @AttorneyOnly('publish')
  @Delete(':id/admins/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an admin (owner), or leave (yourself)' })
  @ApiErrors({ 403: [E.FORBIDDEN], 404: [E.NOT_FOUND] })
  channelRemoveAdmin(
    @CurrentUser() user: RequestUser,
    @Param() p: ChannelAdminParamDto,
  ): Promise<void> {
    return this.channels.removeAdmin(user, p.id, p.userId);
  }

  @Get(':id/posts')
  @ApiOperation({ summary: 'Posts of a channel, newest first' })
  @ApiEnvelopeResponse(ChannelPostDto, { isArray: true })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  channelPosts(
    @CurrentUser() user: RequestUser,
    @Param() p: ChannelIdParamDto,
    @Query() q: ChannelPageQueryDto,
  ): Promise<ChannelPage<ChannelPostDto>> {
    return this.channels.posts(user, p.id, q.cursor, q.limit);
  }

  @AttorneyOnly('publish')
  @Post(':id/posts')
  @UseGuards(RequireIdempotencyKeyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Publish a post (admins)' })
  @ApiEnvelopeResponse(ChannelPostDto, { status: 201 })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN, E.POST_NOT_ALLOWED],
    404: [E.NOT_FOUND],
    409: [E.FILE_NOT_ATTACHABLE, E.VIDEO_NOT_READY],
    429: [E.RATE_LIMITED],
  })
  channelCreatePost(
    @CurrentUser() user: RequestUser,
    @Param() p: ChannelIdParamDto,
    @Body() dto: CreateChannelPostDto,
  ): Promise<ChannelPostDto> {
    return this.channels.createPost(user, p.id, dto);
  }

  @Post(':id/views')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Count the posts a reader saw (once per person)' })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  channelMarkViewed(
    @CurrentUser() user: RequestUser,
    @Param() p: ChannelIdParamDto,
    @Body() dto: ChannelViewsDto,
  ): Promise<void> {
    return this.channels.markViewed(user, p.id, dto.postIds);
  }

  @Post(':id/posts/:postId/share')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Count a share of a post (one per person per day)' })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  channelSharePost(
    @CurrentUser() user: RequestUser,
    @Param() p: ChannelPostParamDto,
  ): Promise<void> {
    return this.channels.sharePost(user, p.id, p.postId);
  }

  @Get(':id/posts/:postId')
  @ApiOperation({ summary: 'One post of a channel' })
  @ApiEnvelopeResponse(ChannelPostDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  channelPost(
    @CurrentUser() user: RequestUser,
    @Param() p: ChannelPostParamDto,
  ): Promise<ChannelPostDto> {
    return this.channels.post(user, p.id, p.postId);
  }

  @AttorneyOnly('publish')
  @Patch(':id/posts/:postId')
  @ApiOperation({ summary: 'Edit a post (admins)' })
  @ApiEnvelopeResponse(ChannelPostDto)
  @ApiErrors({ 403: [E.FORBIDDEN], 404: [E.NOT_FOUND] })
  channelEditPost(
    @CurrentUser() user: RequestUser,
    @Param() p: ChannelPostParamDto,
    @Body() dto: UpdateChannelPostDto,
  ): Promise<ChannelPostDto> {
    return this.channels.editPost(user, p.id, p.postId, dto.body);
  }

  @AttorneyOnly('publish')
  @Delete(':id/posts/:postId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a post (admins)' })
  @ApiErrors({ 403: [E.FORBIDDEN], 404: [E.NOT_FOUND] })
  channelRemovePost(
    @CurrentUser() user: RequestUser,
    @Param() p: ChannelPostParamDto,
  ): Promise<void> {
    return this.channels.removePost(user, p.id, p.postId);
  }

  @Put(':id/posts/:postId/reaction')
  @ApiOperation({ summary: 'React to a post with one emoji' })
  @ApiEnvelopeResponse(ChannelPostDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  channelReact(
    @CurrentUser() user: RequestUser,
    @Param() p: ChannelPostParamDto,
    @Body() dto: ChannelReactionDto,
  ): Promise<ChannelPostDto> {
    return this.channels.react(user, p.id, p.postId, dto.emoji);
  }

  @Delete(':id/posts/:postId/reaction')
  @ApiOperation({ summary: 'Take my reaction back' })
  @ApiEnvelopeResponse(ChannelPostDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  channelUnreact(
    @CurrentUser() user: RequestUser,
    @Param() p: ChannelPostParamDto,
  ): Promise<ChannelPostDto> {
    return this.channels.react(user, p.id, p.postId, null);
  }

  @Get(':id/posts/:postId/comments')
  @ApiOperation({ summary: 'Comments under a post, oldest first' })
  @ApiEnvelopeResponse(ChannelCommentDto, { isArray: true })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  channelComments(
    @CurrentUser() user: RequestUser,
    @Param() p: ChannelPostParamDto,
    @Query() q: ChannelPageQueryDto,
  ): Promise<ChannelPage<ChannelCommentDto>> {
    return this.channels.comments(user, p.id, p.postId, q.cursor, q.limit);
  }

  @AttorneyOnly('publish')
  @Post(':id/posts/:postId/comments')
  @ApiOperation({ summary: 'Comment on a post' })
  @ApiEnvelopeResponse(ChannelCommentDto, { status: 201 })
  @ApiErrors({
    403: [E.FORBIDDEN, E.POST_NOT_ALLOWED, E.USER_BLOCKED],
    404: [E.NOT_FOUND],
    429: [E.RATE_LIMITED],
  })
  channelAddComment(
    @CurrentUser() user: RequestUser,
    @Param() p: ChannelPostParamDto,
    @Body() dto: CreateChannelCommentDto,
  ): Promise<ChannelCommentDto> {
    return this.channels.addComment(user, p.id, p.postId, dto.body);
  }

  @AttorneyOnly('publish')
  @Delete(':id/posts/:postId/comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a comment (author or a channel admin)' })
  @ApiErrors({ 403: [E.FORBIDDEN], 404: [E.NOT_FOUND] })
  channelRemoveComment(
    @CurrentUser() user: RequestUser,
    @Param() p: ChannelCommentParamDto,
  ): Promise<void> {
    return this.channels.removeComment(user, p.id, p.postId, p.commentId);
  }
}
