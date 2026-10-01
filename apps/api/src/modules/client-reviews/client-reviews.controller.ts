import { ReviewSummaryDto } from '../reviews/dto/review-responses.dto';
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
  AppealClientReviewDto,
  ClientIdParamDto,
  ClientReviewIdParamDto,
  ClientReviewDto,
  ClientReviewsQueryDto,
  UpsertClientReviewDto,
  type ClientReviewPage,
} from './client-reviews.dto';
import { ClientReviewsService } from './client-reviews.service';

const E = ErrorCode;

/** Owner 2026-09-30 (OQ-038): attorneys' reviews of clients. */
@ApiTags('client-reviews')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class ClientReviewsController {
  constructor(private readonly reviews: ClientReviewsService) {}

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

  @Get('clients/:id/reviews/mine')
  @ApiOperation({ summary: 'My review of this client, or null' })
  @ApiEnvelopeResponse(ClientReviewDto)
  getMyOpenClientReview(
    @CurrentUser() user: RequestUser,
    @Param() p: ClientIdParamDto,
  ): Promise<ClientReviewDto | null> {
    return this.reviews.mineFor(user, p.id);
  }

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

  @Post('client-reviews/:id/appeal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'The reviewed client asks to remove a review (admins decide; removed after 30 days if undecided)',
  })
  @ApiEnvelopeResponse(ClientReviewDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.REVIEW_APPEAL_EXISTS],
  })
  appealClientReview(
    @CurrentUser() user: RequestUser,
    @Param() p: ClientReviewIdParamDto,
    @Body() dto: AppealClientReviewDto,
  ): Promise<ClientReviewDto> {
    return this.reviews.appeal(user, p.id, dto.reason);
  }

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
