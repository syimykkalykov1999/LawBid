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
import {
  CreatePostDto,
  PostDeletedDto,
  PostDto,
  PostIdParamDto,
  PostsPageQueryDto,
  SavedPostItemDto,
  SavedPostsQueryDto,
  UpdatePostDto,
  type PostPage,
} from './dto/posts.dto';
import { PostEngagementService } from './post-engagement.service';
import { PostsService } from './posts.service';
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
  ) {}

  @AttorneyOnly()
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

  @Get('posts/:id')
  @ApiOperation({ summary: 'A post (docs/05 §3.5)' })
  @ApiEnvelopeResponse(PostDto)
  @ApiErrors({ 404: [E.POST_NOT_FOUND] })
  getPost(
    @CurrentUser() user: RequestUser,
    @Param() p: PostIdParamDto,
  ): Promise<PostDto> {
    return this.posts.get(user, p.id);
  }

  @AttorneyOnly()
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

  @Delete('posts/:id/like')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a like (idempotent, docs/05 §4)' })
  unlikePost(
    @CurrentUser() user: RequestUser,
    @Param() p: PostIdParamDto,
  ): Promise<void> {
    return this.engagement.unlike(user.sub, p.id);
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
