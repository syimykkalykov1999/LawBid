import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
  Roles,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminSubscriptionUserParamDto } from '../billing/billing.dto';
import {
  AdminBillingReasonDto,
  AdminCancelSubscriptionDto,
  AdminSubscriptionActionResultDto,
} from './admin-billing.dto';
import { SubscriptionAdminService } from './subscription-admin.service';

const E = ErrorCode;

/** Owner 2026-10-04: cancel / resume an attorney's subscription on a
 * support request. Lives under /admin/subscriptions (the money area). */
@ApiTags('admin-subscriptions')
@AdminEndpoint('super_admin', 'finance', 'support')
@SkipAutoAudit()
@Controller('admin/subscriptions')
export class SubscriptionAdminController {
  constructor(private readonly subs: SubscriptionAdminService) {}

  @Post(':userId/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles('super_admin', 'finance')
  @ApiOperation({
    summary:
      'Cancel at period end or now (optional prorated / full refund); reason audited, attorney notified',
  })
  @ApiEnvelopeResponse(AdminSubscriptionActionResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.SUBSCRIPTION_NOT_FOUND],
    409: [E.CONTENT_INVALID_STATE],
    503: [E.PAYMENTS_NOT_CONFIGURED],
  })
  cancelAdminSubscription(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminSubscriptionUserParamDto,
    @Body() dto: AdminCancelSubscriptionDto,
  ): Promise<AdminSubscriptionActionResultDto> {
    return this.subs.cancel(admin, p.userId, dto);
  }

  @Post(':userId/resume')
  @HttpCode(HttpStatus.OK)
  @Roles('super_admin', 'finance')
  @ApiOperation({ summary: 'Undo a pending cancel at period end' })
  @ApiEnvelopeResponse(AdminSubscriptionActionResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.SUBSCRIPTION_NOT_FOUND],
    409: [E.CONTENT_INVALID_STATE],
    503: [E.PAYMENTS_NOT_CONFIGURED],
  })
  resumeAdminSubscription(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminSubscriptionUserParamDto,
    @Body() dto: AdminBillingReasonDto,
  ): Promise<AdminSubscriptionActionResultDto> {
    return this.subs.resume(admin, p.userId, dto.reason);
  }
}
