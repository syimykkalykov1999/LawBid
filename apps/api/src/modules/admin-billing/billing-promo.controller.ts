import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { AttorneyOnly } from '../auth/assistant/assistant-context';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { PromoValidationDto, ValidatePromoDto } from './admin-billing.dto';
import { PromoCodesService } from './promo-codes.service';

/** Owner 2026-10-02: the app checks a promo code before checkout. */
@ApiTags('billing')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@AttorneyOnly()
@Controller('billing/promo')
export class BillingPromoController {
  constructor(private readonly promos: PromoCodesService) {}

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Is this promo code usable by me for this purchase?',
  })
  @ApiEnvelopeResponse(PromoValidationDto)
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  validatePromoCode(
    @CurrentUser() user: RequestUser,
    @Body() dto: ValidatePromoDto,
  ): Promise<PromoValidationDto> {
    return this.promos.validate(user, dto);
  }
}
