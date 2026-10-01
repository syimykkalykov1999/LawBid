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
import {
  AttorneyIdParamDto,
  CaseIdParamDto,
  CreateReviewDto,
  ListReviewsQueryDto,
  ReportReviewDto,
  ReviewHelpfulDto,
  ReviewReplyDto,
  ReviewIdParamDto,
  UpdateReviewDto,
} from './dto/review-requests.dto';
import {
  PublicReviewDto,
  ReviewDto,
  ReviewReportDto,
  ReviewSummaryDto,
  type ReviewPage,
} from './dto/review-responses.dto';
import { ReviewsService } from './reviews.service';
import { AssistantSelf } from '../auth/assistant/assistant-context';

const E = ErrorCode;

/**
 * docs/03_VERIFICATION_PROFILES.md §7.6. Every route needs a bearer token
 * (global JwtAuthGuard); access rules live in ReviewsService.
 */
@ApiTags('reviews')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post('cases/:caseId/review')
  @UseGuards(RequireIdempotencyKeyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary: 'Review the attorney of a closed case (client, once per case)',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Required (docs/03 §7.2): a retry with the same key and body returns the first result instead of a second review.',
  })
  @ApiEnvelopeResponse(ReviewDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.IDEMPOTENCY_KEY_REQUIRED],
    403: [E.FORBIDDEN],
    404: [E.NOT_FOUND],
    409: [
      E.REVIEW_CASE_NOT_CLOSED,
      E.REVIEW_NO_ACCEPTED_BID,
      E.REVIEW_ALREADY_EXISTS,
      E.IDEMPOTENCY_KEY_CONFLICT,
    ],
  })
  create(
    @CurrentUser() user: RequestUser,
    @Param() params: CaseIdParamDto,
    @Body() dto: CreateReviewDto,
  ): Promise<ReviewDto> {
    return this.reviews.create(user, params.caseId, dto);
  }

  @Get('cases/:caseId/review')
  @ApiOperation({
    summary: "The client's own review of a case (to edit it)",
  })
  @ApiEnvelopeResponse(ReviewDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  getForCase(
    @CurrentUser() user: RequestUser,
    @Param() params: CaseIdParamDto,
  ): Promise<ReviewDto> {
    return this.reviews.getForCase(user, params.caseId);
  }

  @Patch('reviews/:id')
  @ApiOperation({
    summary: 'Edit own review within review.edit_window_days (client)',
  })
  @ApiEnvelopeResponse(ReviewDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.REVIEW_EDIT_WINDOW_EXPIRED, E.REVIEW_NOT_EDITABLE],
  })
  update(
    @CurrentUser() user: RequestUser,
    @Param() params: ReviewIdParamDto,
    @Body() dto: UpdateReviewDto,
  ): Promise<ReviewDto> {
    return this.reviews.update(user, params.id, dto);
  }

  @Get('attorneys/:id/reviews')
  @ApiOperation({ summary: 'Published reviews of an attorney, newest first' })
  @ApiEnvelopeResponse(PublicReviewDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  list(
    @CurrentUser() user: RequestUser,
    @Param() params: AttorneyIdParamDto,
    @Query() query: ListReviewsQueryDto,
  ): Promise<ReviewPage> {
    return this.reviews.list(params.id, query, user.sub);
  }

  @Get('attorneys/:id/reviews/summary')
  @ApiOperation({
    summary: 'Average rating, count and per-star distribution of an attorney',
  })
  @ApiEnvelopeResponse(ReviewSummaryDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  summary(@Param() params: AttorneyIdParamDto): Promise<ReviewSummaryDto> {
    return this.reviews.summary(params.id);
  }

  // Owner 2026-10-01: anyone reviews any attorney (assistants as
  // themselves, not as their attorney).
  @AssistantSelf()
  @Put('attorneys/:id/reviews/mine')
  @ApiOperation({ summary: 'Write / edit my open review of an attorney' })
  @ApiEnvelopeResponse(ReviewDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN],
    404: [E.NOT_FOUND],
  })
  upsertOpen(
    @CurrentUser() user: RequestUser,
    @Param() params: AttorneyIdParamDto,
    @Body() dto: CreateReviewDto,
  ): Promise<ReviewDto> {
    return this.reviews.upsertOpen(user, params.id, dto);
  }

  @AssistantSelf()
  @Get('attorneys/:id/reviews/mine')
  @ApiOperation({ summary: 'My open review of an attorney (or null)' })
  @ApiEnvelopeResponse(ReviewDto)
  mine(
    @CurrentUser() user: RequestUser,
    @Param() params: AttorneyIdParamDto,
  ): Promise<ReviewDto | null> {
    return this.reviews.mineFor(user, params.id);
  }

  @AssistantSelf()
  @Delete('reviews/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove my own review' })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  async removeOwn(
    @CurrentUser() user: RequestUser,
    @Param() params: ReviewIdParamDto,
  ): Promise<void> {
    await this.reviews.removeOwn(user, params.id);
  }

  // Owner 2026-10-01 (Google-style): the attorney's public reply.
  @Put('reviews/:id/reply')
  @ApiOperation({ summary: "The reviewed attorney's public reply" })
  @ApiEnvelopeResponse(PublicReviewDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  replyToReview(
    @CurrentUser() user: RequestUser,
    @Param() params: ReviewIdParamDto,
    @Body() dto: ReviewReplyDto,
  ): Promise<PublicReviewDto> {
    return this.reviews.reply(user, params.id, dto.body);
  }

  @Delete('reviews/:id/reply')
  @ApiOperation({ summary: 'Remove my reply' })
  @ApiEnvelopeResponse(PublicReviewDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  deleteReviewReply(
    @CurrentUser() user: RequestUser,
    @Param() params: ReviewIdParamDto,
  ): Promise<PublicReviewDto> {
    return this.reviews.reply(user, params.id, null);
  }

  @AssistantSelf()
  @Post('reviews/:id/helpful')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '"Helpful" on / off' })
  @ApiEnvelopeResponse(PublicReviewDto)
  @ApiErrors({ 403: [E.FORBIDDEN], 404: [E.NOT_FOUND] })
  markHelpful(
    @CurrentUser() user: RequestUser,
    @Param() params: ReviewIdParamDto,
    @Body() dto: ReviewHelpfulDto,
  ): Promise<PublicReviewDto> {
    return this.reviews.helpful(user, params.id, dto.helpful);
  }

  @AssistantSelf()
  @Post('reviews/:id/report')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary: 'Flag a review against the policy (anyone but the author)',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Resource-creating POST: a retry with the same key and body is applied once (see IdempotencyInterceptor).',
  })
  @ApiEnvelopeResponse(ReviewReportDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN],
    404: [E.NOT_FOUND],
    409: [E.IDEMPOTENCY_KEY_CONFLICT],
  })
  report(
    @CurrentUser() user: RequestUser,
    @Param() params: ReviewIdParamDto,
    @Body() dto: ReportReviewDto,
  ): Promise<ReviewReportDto> {
    return this.reviews.report(user, params.id, dto);
  }
}
