import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  MovePlanSubscribersDto,
  MovePlanSubscribersResultDto,
  PlanKindParamDto,
  AdminPlanPricesDto,
  SetPlanPriceDto,
  AdminSetPlanPriceResultDto,
} from './admin-pricing.dto';
import { AdminPricingService } from './admin-pricing.service';

const E = ErrorCode;

/**
 * Owner 2026-10-03: Billing → Prices — the attorney plans and the
 * client badge. The super admin alone sees and changes prices (owner:
 * "только супер админ"); no area toggle opens it. Every change writes
 * its own audit_log row.
 */
@ApiTags('admin-billing')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/billing/prices')
export class AdminPricingController {
  constructor(private readonly prices: AdminPricingService) {}

  @Get()
  @ApiOperation({ summary: 'Plan prices, subscribers and change history' })
  @ApiEnvelopeResponse(AdminPlanPricesDto)
  listPlanPrices(): Promise<AdminPlanPricesDto> {
    return this.prices.list();
  }

  @Put(':kind')
  @ApiOperation({
    summary:
      'Set a plan price: new purchases pay it, current subscribers keep theirs',
  })
  @ApiEnvelopeResponse(AdminSetPlanPriceResultDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  setPlanPrice(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: PlanKindParamDto,
    @Body() dto: SetPlanPriceDto,
  ): Promise<AdminSetPlanPriceResultDto> {
    return this.prices.set(admin, p.kind, dto.amountCents, dto.note);
  }

  @Post(':kind/move-subscribers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Move current subscribers to today's price from their next renewal",
  })
  @ApiEnvelopeResponse(MovePlanSubscribersResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    503: [E.PAYMENTS_NOT_CONFIGURED],
  })
  movePlanSubscribers(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: PlanKindParamDto,
    @Body() dto: MovePlanSubscribersDto,
  ): Promise<MovePlanSubscribersResultDto> {
    return this.prices.moveSubscribers(admin, p.kind, dto.reason);
  }
}
