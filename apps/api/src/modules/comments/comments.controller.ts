import {
  Body,
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
import { PostIdParamDto } from '../posts/dto/posts.dto';
import {
  CommentDeletedDto,
  CommentDto,
  CommentIdParamDto,
  CommentsQueryDto,
  CreateCommentDto,
  type CommentPage,
} from './comments.dto';
import { CommentsService } from './comments.service';
import { AttorneyOnly } from '../auth/assistant/assistant-context';

const E = ErrorCode;

/** docs/05 §5, §15 "Комментарии" (stage 5.4). */
@ApiTags('comments')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('posts/:id/comments')
  @ApiOperation({ summary: 'Top-level comments, newest first (docs/05 §5.3)' })
  @ApiEnvelopeResponse(CommentDto, { isArray: true })
  @ApiErrors({ 404: [E.POST_NOT_FOUND] })
  listComments(
    @CurrentUser() user: RequestUser,
    @Param() p: PostIdParamDto,
    @Query() q: CommentsQueryDto,
  ): Promise<CommentPage> {
    return this.comments.list(user.sub, p.id, q.cursor);
  }

  @Get('comments/:id/replies')
  @ApiOperation({ summary: 'Replies of a comment (docs/05 §5.3)' })
  @ApiEnvelopeResponse(CommentDto, { isArray: true })
  @ApiErrors({ 404: [E.COMMENT_NOT_FOUND] })
  listReplies(
    @CurrentUser() user: RequestUser,
    @Param() p: CommentIdParamDto,
    @Query() q: CommentsQueryDto,
  ): Promise<CommentPage> {
    return this.comments.replies(user.sub, p.id, q.cursor);
  }

  @AttorneyOnly()
  @Post('posts/:id/comments')
  @ApiOperation({ summary: 'Comment or reply (docs/05 §5.1)' })
  @ApiEnvelopeResponse(CommentDto, { status: 201 })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.POST_NOT_FOUND, E.COMMENT_NOT_FOUND],
    422: [E.CONTENT_BLOCKED],
    429: [E.RATE_LIMITED],
  })
  createComment(
    @CurrentUser() user: RequestUser,
    @Param() p: PostIdParamDto,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentDto> {
    return this.comments.create(user.sub, p.id, dto.body, dto.parentCommentId);
  }

  // OQ-048: publications are the attorney's — an assistant never deletes.
  @AttorneyOnly()
  @Delete('comments/:id')
  @ApiOperation({
    summary: 'Delete own comment or one under own post (docs/05 §5.1)',
  })
  @ApiEnvelopeResponse(CommentDeletedDto)
  @ApiErrors({ 404: [E.COMMENT_NOT_FOUND] })
  deleteComment(
    @CurrentUser() user: RequestUser,
    @Param() p: CommentIdParamDto,
  ): Promise<{ deleted: true }> {
    return this.comments.remove(user.sub, p.id);
  }

  @Post('comments/:id/like')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Like a comment (idempotent)' })
  @ApiErrors({ 404: [E.COMMENT_NOT_FOUND], 429: [E.RATE_LIMITED] })
  likeComment(
    @CurrentUser() user: RequestUser,
    @Param() p: CommentIdParamDto,
  ): Promise<void> {
    return this.comments.like(user.sub, p.id);
  }

  @Delete('comments/:id/like')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a comment like (idempotent)' })
  unlikeComment(
    @CurrentUser() user: RequestUser,
    @Param() p: CommentIdParamDto,
  ): Promise<void> {
    return this.comments.unlike(user.sub, p.id);
  }
}
