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
import { CaseIdParamDto } from '../cases/dto/cases-feed.dto';
import {
  CommentDeletedDto,
  CommentIdParamDto,
  CommentsQueryDto,
  CreateCommentDto,
} from '../comments/comments.dto';
import { CaseCommentDto, type CaseCommentPage } from './case-comments.dto';
import { CaseCommentsService } from './case-comments.service';

const E = ErrorCode;

/** Owner 2026-09-30 (OQ-034): comments under cases. */
@ApiTags('case-comments')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class CaseCommentsController {
  constructor(private readonly comments: CaseCommentsService) {}

  @Get('cases/:id/comments')
  @ApiOperation({ summary: 'Top-level comments of a case, newest first' })
  @ApiEnvelopeResponse(CaseCommentDto, { isArray: true })
  @ApiErrors({ 404: [E.CASE_NOT_FOUND] })
  listCaseComments(
    @CurrentUser() user: RequestUser,
    @Param() p: CaseIdParamDto,
    @Query() q: CommentsQueryDto,
  ): Promise<CaseCommentPage> {
    return this.comments.list(user, p.id, q.cursor);
  }

  @Post('cases/:id/share')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Count a completed share of a case (OQ-037)' })
  @ApiErrors({ 404: [E.CASE_NOT_FOUND], 429: [E.RATE_LIMITED] })
  shareCase(
    @CurrentUser() user: RequestUser,
    @Param() p: CaseIdParamDto,
  ): Promise<void> {
    return this.comments.shareCase(user, p.id);
  }

  @Get('case-comments/:id/replies')
  @ApiOperation({ summary: 'Replies of a case comment' })
  @ApiEnvelopeResponse(CaseCommentDto, { isArray: true })
  @ApiErrors({ 404: [E.COMMENT_NOT_FOUND, E.CASE_NOT_FOUND] })
  listCaseCommentReplies(
    @CurrentUser() user: RequestUser,
    @Param() p: CommentIdParamDto,
    @Query() q: CommentsQueryDto,
  ): Promise<CaseCommentPage> {
    return this.comments.replies(user, p.id, q.cursor);
  }

  @Post('cases/:id/comments')
  @ApiOperation({ summary: 'Comment on a case or reply' })
  @ApiEnvelopeResponse(CaseCommentDto, { status: 201 })
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.CASE_CONTAINS_CONTACT_INFO],
    404: [E.CASE_NOT_FOUND, E.COMMENT_NOT_FOUND],
    422: [E.CONTENT_BLOCKED],
    429: [E.RATE_LIMITED],
  })
  createCaseComment(
    @CurrentUser() user: RequestUser,
    @Param() p: CaseIdParamDto,
    @Body() dto: CreateCommentDto,
  ): Promise<CaseCommentDto> {
    return this.comments.create(user, p.id, dto.body, dto.parentCommentId);
  }

  @Delete('case-comments/:id')
  @ApiOperation({ summary: 'Delete own comment or one under own case' })
  @ApiEnvelopeResponse(CommentDeletedDto)
  @ApiErrors({ 404: [E.COMMENT_NOT_FOUND] })
  deleteCaseComment(
    @CurrentUser() user: RequestUser,
    @Param() p: CommentIdParamDto,
  ): Promise<{ deleted: true }> {
    return this.comments.remove(user, p.id);
  }

  @Post('case-comments/:id/like')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Like a case comment (idempotent)' })
  @ApiErrors({ 404: [E.COMMENT_NOT_FOUND], 429: [E.RATE_LIMITED] })
  likeCaseComment(
    @CurrentUser() user: RequestUser,
    @Param() p: CommentIdParamDto,
  ): Promise<void> {
    return this.comments.like(user, p.id);
  }

  @Delete('case-comments/:id/like')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a case comment like (idempotent)' })
  unlikeCaseComment(
    @CurrentUser() user: RequestUser,
    @Param() p: CommentIdParamDto,
  ): Promise<void> {
    return this.comments.unlike(user, p.id);
  }
}
