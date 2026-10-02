import {
  Body,
  Controller,
  Get,
  Param,
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
  CasePromotionStateDto,
  CreatePromotionDto,
  CreatePromotionResultDto,
  PromotionCaseIdParamDto,
  PromotionQuoteDto,
  PromotionQuoteQueryDto,
} from './promotions.dto';
import { PromotionsService } from './promotions.service';

const E = ErrorCode;

/** Owner 2026-10-02: the client promotes their own open case (~$10/day). */
@ApiTags('promotions')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get('promotions/quote')
  @ApiOperation({ summary: 'Price of promoting a case for N days' })
  @ApiEnvelopeResponse(PromotionQuoteDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  getPromotionQuote(
    @CurrentUser() user: RequestUser,
    @Query() q: PromotionQuoteQueryDto,
  ): Promise<PromotionQuoteDto> {
    return this.promotions.quote(user.sub, q.days);
  }

  @Get('cases/:id/promotion')
  @ApiOperation({
    summary: "My case's current / last promotion and a quote (case owner)",
  })
  @ApiEnvelopeResponse(CasePromotionStateDto)
  @ApiErrors({ 404: [E.CASE_NOT_FOUND] })
  getCasePromotion(
    @CurrentUser() user: RequestUser,
    @Param() p: PromotionCaseIdParamDto,
  ): Promise<CasePromotionStateDto> {
    return this.promotions.caseState(user.sub, p.id);
  }

  @Post('cases/:id/promotions')
  @UseGuards(RequireIdempotencyKeyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary:
      'Promote my open case: free with credits / a 100 % code, else a checkout URL',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Required: a retry with the same key and body returns the first result instead of a second checkout.',
  })
  @ApiEnvelopeResponse(CreatePromotionResultDto, { status: 201 })
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.PROMO_CODE_INVALID, E.IDEMPOTENCY_KEY_REQUIRED],
    403: [E.FEATURE_DISABLED],
    404: [E.CASE_NOT_FOUND],
    409: [
      E.CASE_INVALID_STATE,
      E.PROMOTION_ALREADY_ACTIVE,
      E.IDEMPOTENCY_KEY_CONFLICT,
    ],
    503: [E.PAYMENTS_NOT_CONFIGURED],
  })
  createCasePromotion(
    @CurrentUser() user: RequestUser,
    @Param() p: PromotionCaseIdParamDto,
    @Body() dto: CreatePromotionDto,
  ): Promise<CreatePromotionResultDto> {
    return this.promotions.create(user.sub, p.id, dto);
  }
}
