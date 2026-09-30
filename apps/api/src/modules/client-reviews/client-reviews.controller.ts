import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
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
  ClientIdParamDto,
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

  @Get('clients/:id/reviews')
  @ApiOperation({
    summary: 'Reviews of a client (attorneys and the client only)',
  })
  @ApiEnvelopeResponse(ClientReviewDto, { isArray: true })
  @ApiErrors({ 403: [E.FORBIDDEN], 404: [E.NOT_FOUND] })
  listClientReviews(
    @CurrentUser() user: RequestUser,
    @Param() p: ClientIdParamDto,
    @Query() q: ClientReviewsQueryDto,
  ): Promise<ClientReviewPage> {
    return this.reviews.list(user, p.id, q.cursor);
  }
}
