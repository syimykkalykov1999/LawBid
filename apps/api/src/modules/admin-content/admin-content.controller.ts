import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  Roles,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  AdminBidRowDto,
  AdminBidsQueryDto,
  AdminCommentRowDto,
  AdminCommentsQueryDto,
  AdminIdParamDto,
  AdminListQueryDto,
  AdminOverviewDto,
  AdminPostRowDto,
  AdminPostsQueryDto,
  AdminPracticeAreaDto,
  AdminRemoveCommentDto,
  AdminRemoveDto,
  AdminReviewRowDto,
  BroadcastDto,
  CreateBroadcastDto,
  CreatePracticeAreaDto,
  ExportParamDto,
  UpdatePracticeAreaDto,
} from './admin-content.dto';
import { AdminContentService } from './admin-content.service';

const E = ErrorCode;
type Page<T> = { items: T[]; nextCursor: string | null };

/** Owner 2026-09-30: the remaining admin panel sections. */
@ApiTags('admin-content')
@AdminEndpoint('super_admin', 'moderator', 'support', 'finance', 'verifier')
@Controller('admin')
export class AdminContentController {
  constructor(private readonly content: AdminContentService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Extended numbers for the dashboard' })
  @ApiEnvelopeResponse(AdminOverviewDto)
  getAdminOverview(): Promise<AdminOverviewDto> {
    return this.content.overview();
  }

  // --- content (moderators) ----------------------------------------------------

  @Roles('super_admin', 'moderator')
  @Get('content/posts')
  @ApiOperation({ summary: 'Posts and news, newest first' })
  @ApiEnvelopeResponse(AdminPostRowDto, { isArray: true })
  listAdminPosts(
    @Query() q: AdminPostsQueryDto,
  ): Promise<Page<AdminPostRowDto>> {
    return this.content.posts(q.q, q.kind, q.cursor);
  }

  @Roles('super_admin', 'moderator')
  @Post('content/posts/:id/remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a post (reason goes to the audit log)' })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  removeAdminPost(
    @Param() p: AdminIdParamDto,
    @Body() dto: AdminRemoveDto,
  ): Promise<void> {
    return this.content.removePost(p.id, dto.reason);
  }

  @Roles('super_admin', 'moderator')
  @Get('content/comments')
  @ApiOperation({ summary: 'Post or case comments, newest first' })
  @ApiEnvelopeResponse(AdminCommentRowDto, { isArray: true })
  listAdminComments(
    @Query() q: AdminCommentsQueryDto,
  ): Promise<Page<AdminCommentRowDto>> {
    return this.content.comments(q.thread ?? 'post', q.q, q.cursor);
  }

  @Roles('super_admin', 'moderator')
  @Post('content/comments/:id/remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a comment' })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  removeAdminComment(
    @Param() p: AdminIdParamDto,
    @Body() dto: AdminRemoveCommentDto,
  ): Promise<void> {
    return this.content.removeComment(p.id, dto.thread, dto.reason);
  }

  @Roles('super_admin', 'moderator')
  @Get('content/reviews')
  @ApiOperation({ summary: 'Reviews of attorneys, newest first' })
  @ApiEnvelopeResponse(AdminReviewRowDto, { isArray: true })
  listAdminReviews(
    @Query() q: AdminListQueryDto,
  ): Promise<Page<AdminReviewRowDto>> {
    return this.content.reviews(q.cursor);
  }

  @Roles('super_admin', 'moderator')
  @Post('content/reviews/:id/hide')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Hide a review' })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  hideAdminReview(
    @Param() p: AdminIdParamDto,
    @Body() dto: AdminRemoveDto,
  ): Promise<void> {
    return this.content.setReviewStatus(p.id, 'hidden', dto.reason);
  }

  @Roles('super_admin', 'moderator')
  @Post('content/reviews/:id/restore')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Show a hidden review again' })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  restoreAdminReview(@Param() p: AdminIdParamDto): Promise<void> {
    return this.content.setReviewStatus(p.id, 'published');
  }

  // --- bids --------------------------------------------------------------------

  @Roles('super_admin', 'support')
  @Get('bids')
  @ApiOperation({ summary: 'All bids, newest first' })
  @ApiEnvelopeResponse(AdminBidRowDto, { isArray: true })
  listAdminBids(@Query() q: AdminBidsQueryDto): Promise<Page<AdminBidRowDto>> {
    return this.content.bids(q.status, q.q, q.cursor);
  }

  // --- qualifications --------------------------------------------------------------

  @Roles('super_admin')
  @Get('practice-areas')
  @ApiOperation({ summary: 'Every qualification with usage counts' })
  @ApiEnvelopeResponse(AdminPracticeAreaDto, { isArray: true })
  listAdminPracticeAreas(): Promise<AdminPracticeAreaDto[]> {
    return this.content.practiceAreas();
  }

  @Roles('super_admin')
  @Post('practice-areas')
  @ApiOperation({ summary: 'Add a qualification' })
  @ApiEnvelopeResponse(AdminPracticeAreaDto, { isArray: true })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  createAdminPracticeArea(
    @Body() dto: CreatePracticeAreaDto,
  ): Promise<AdminPracticeAreaDto[]> {
    return this.content.createPracticeArea(dto);
  }

  @Roles('super_admin')
  @Patch('practice-areas/:id')
  @ApiOperation({ summary: 'Rename, reorder or switch off a qualification' })
  @ApiEnvelopeResponse(AdminPracticeAreaDto, { isArray: true })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  updateAdminPracticeArea(
    @Param() p: AdminIdParamDto,
    @Body() dto: UpdatePracticeAreaDto,
  ): Promise<AdminPracticeAreaDto[]> {
    return this.content.updatePracticeArea(p.id, dto);
  }

  // --- broadcasts ----------------------------------------------------------------

  @Roles('super_admin')
  @Get('broadcasts')
  @ApiOperation({ summary: 'Sent broadcasts (last 100)' })
  @ApiEnvelopeResponse(BroadcastDto, { isArray: true })
  listAdminBroadcasts(): Promise<BroadcastDto[]> {
    return this.content.broadcasts();
  }

  @Roles('super_admin')
  @Post('broadcasts')
  @ApiOperation({ summary: 'Send a push + in-app message to an audience' })
  @ApiEnvelopeResponse(BroadcastDto)
  sendAdminBroadcast(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: CreateBroadcastDto,
  ): Promise<BroadcastDto> {
    return this.content.broadcast(admin.id, dto);
  }

  // --- CSV ---------------------------------------------------------------------

  @Roles('super_admin', 'finance', 'support')
  @Get('export/:entity')
  @ApiOperation({ summary: 'CSV export (up to 50 000 rows)' })
  @ApiProduces('text/csv')
  async exportAdminCsv(
    @Param() p: ExportParamDto,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.content.exportCsv(p.entity);
    const day = new Date().toISOString().slice(0, 10);
    res
      .type('text/csv; charset=utf-8')
      .setHeader(
        'Content-Disposition',
        `attachment; filename="lawbid-${p.entity}-${day}.csv"`,
      )
      .send(csv);
  }
}
