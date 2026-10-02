import { ReviewSummaryDto } from '../reviews/dto/review-responses.dto';
import {
  ReportReviewDto,
  ReviewHelpfulDto,
  ReviewReplyDto,
} from '../reviews/dto/review-requests.dto';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
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
  ClientReviewReportDto,
  ClientIdParamDto,
  ClientReviewIdParamDto,
  ClientReviewDto,
  ClientReviewsQueryDto,
  UpsertClientReviewDto,
  type ClientReviewPage,
} from './client-reviews.dto';
import {
  AssistantSelf,
  AttorneyOnly,
} from '../auth/assistant/assistant-context';
import { ClientReviewsService } from './client-reviews.service';

const E = ErrorCode;

/** Owner 2026-09-30 (OQ-038): attorneys' reviews of clients. */
@ApiTags('client-reviews')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class ClientReviewsController {
  constructor(private readonly reviews: ClientReviewsService) {}

  // Audit 2026-10-02: the case review is the attorney's own word.
  @AttorneyOnly()
  @Put('cases/:id/client-review')
  @ApiOperation({ summary: "Review the case's client (hired attorney)" })
  @ApiEnvelopeResponse(ClientReviewDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.CASE_CONTAINS_CONTACT_INFO],
    403: [E.FORBIDDEN],
  })
  upsertClientReview(
    @CurrentUser() user: RequestUser,
    @Param() p: CaseIdParamDto,
    @Body() dto: UpsertClientReviewDto,
  ): Promise<ClientReviewDto> {
    return this.reviews.upsert(user, p.id, dto);
  }

  @Get('cases/:id/client-review')
  @ApiOperation({ summary: 'My review of the case client, or null' })
  @ApiEnvelopeResponse(ClientReviewDto)
  getMyClientReview(
    @CurrentUser() user: RequestUser,
    @Param() p: CaseIdParamDto,
  ): Promise<ClientReviewDto | null> {
    return this.reviews.mine(user, p.id);
  }

  // Owner 2026-10-01: assistants review and are reviewed as themselves.
  @AssistantSelf()
  @Put('clients/:id/reviews/mine')
  @ApiOperation({
    summary:
      'Review a client — any attorney or client, once (owner 2026-09-30)',
  })
  @ApiEnvelopeResponse(ClientReviewDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.CASE_CONTAINS_CONTACT_INFO],
    403: [E.FORBIDDEN],
    404: [E.NOT_FOUND],
  })
  upsertOpenClientReview(
    @CurrentUser() user: RequestUser,
    @Param() p: ClientIdParamDto,
    @Body() dto: UpsertClientReviewDto,
  ): Promise<ClientReviewDto> {
    return this.reviews.upsertOpen(user, p.id, dto);
  }

  // Owner 2026-10-01: assistants review and are reviewed as themselves.
  @AssistantSelf()
  @Get('clients/:id/reviews/mine')
  @ApiOperation({ summary: 'My review of this client, or null' })
  @ApiEnvelopeResponse(ClientReviewDto)
  getMyOpenClientReview(
    @CurrentUser() user: RequestUser,
    @Param() p: ClientIdParamDto,
  ): Promise<ClientReviewDto | null> {
    return this.reviews.mineFor(user, p.id);
  }

  // Owner 2026-10-01: assistants review and are reviewed as themselves.
  @AssistantSelf()
  @Delete('client-reviews/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete my review of a client' })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  async deleteClientReview(
    @CurrentUser() user: RequestUser,
    @Param() p: ClientReviewIdParamDto,
  ): Promise<void> {
    await this.reviews.remove(user, p.id);
  }

  // Owner 2026-10-01 (Google-style): the reviewed person replies
  // publicly; anyone marks "Helpful" or flags a review to moderation.
  // (Appeals with automatic removal are retired.)
  @AssistantSelf()
  @Put('client-reviews/:id/reply')
  @ApiOperation({ summary: "The reviewed person's public reply" })
  @ApiEnvelopeResponse(ClientReviewDto)
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR], 404: [ErrorCode.NOT_FOUND] })
  replyToClientReview(
    @CurrentUser() user: RequestUser,
    @Param() p: ClientReviewIdParamDto,
    @Body() dto: ReviewReplyDto,
  ): Promise<ClientReviewDto> {
    return this.reviews.reply(user, p.id, dto.body);
  }

  @AssistantSelf()
  @Delete('client-reviews/:id/reply')
  @ApiOperation({ summary: 'Remove my reply' })
  @ApiEnvelopeResponse(ClientReviewDto)
  @ApiErrors({ 404: [ErrorCode.NOT_FOUND] })
  deleteClientReviewReply(
    @CurrentUser() user: RequestUser,
    @Param() p: ClientReviewIdParamDto,
  ): Promise<ClientReviewDto> {
    return this.reviews.reply(user, p.id, null);
  }

  @AssistantSelf()
  @Post('client-reviews/:id/helpful')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '"Helpful" on / off' })
  @ApiEnvelopeResponse(ClientReviewDto)
  @ApiErrors({ 403: [ErrorCode.FORBIDDEN], 404: [ErrorCode.NOT_FOUND] })
  markClientReviewHelpful(
    @CurrentUser() user: RequestUser,
    @Param() p: ClientReviewIdParamDto,
    @Body() dto: ReviewHelpfulDto,
  ): Promise<ClientReviewDto> {
    return this.reviews.helpful(user, p.id, dto.helpful);
  }

  @AssistantSelf()
  @Post('client-reviews/:id/report')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Flag a review against the policy' })
  @ApiEnvelopeResponse(ClientReviewReportDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    403: [ErrorCode.FORBIDDEN],
    404: [ErrorCode.NOT_FOUND],
  })
  reportClientReview(
    @CurrentUser() user: RequestUser,
    @Param() p: ClientReviewIdParamDto,
    @Body() dto: ReportReviewDto,
  ): Promise<ClientReviewReportDto> {
    return this.reviews.report(user, p.id, dto.reason, dto.note ?? undefined);
  }

  // Owner 2026-10-01: assistants review and are reviewed as themselves.
  @AssistantSelf()
  @Get('clients/:id/reviews')
  @ApiOperation({
    summary: 'Reviews of a client (every signed-in user)',
  })
  @ApiEnvelopeResponse(ClientReviewDto, { isArray: true })
  @ApiErrors({ 403: [E.FORBIDDEN], 404: [E.NOT_FOUND] })
  listClientReviews(
    @CurrentUser() user: RequestUser,
    @Param() p: ClientIdParamDto,
    @Query() q: ClientReviewsQueryDto,
  ): Promise<ClientReviewPage> {
    return this.reviews.list(user, p.id, q);
  }

  // Owner 2026-10-01: assistants review and are reviewed as themselves.
  @AssistantSelf()
  @Get('clients/:id/reviews/summary')
  @ApiOperation({
    summary: 'Average, count and per-star distribution of a client',
  })
  @ApiEnvelopeResponse(ReviewSummaryDto)
  @ApiErrors({ 403: [E.FORBIDDEN], 404: [E.NOT_FOUND] })
  clientReviewsSummary(
    @CurrentUser() user: RequestUser,
    @Param() p: ClientIdParamDto,
  ): Promise<ReviewSummaryDto> {
    return this.reviews.summary(user, p.id);
  }
}
