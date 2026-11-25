import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
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
  constructor(
    private readonly subs: SubscriptionAdminService,
    private readonly auth: AdminAuthService,
  ) {}

  @Post(':userId/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles('super_admin', 'finance')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Required when money goes back (refund ≠ none): a retry returns the first answer, never a second refund.',
  })
  @ApiOperation({
    summary:
      'Cancel at period end or now (optional prorated / full refund); reason audited, attorney notified',
  })
  @ApiEnvelopeResponse(AdminSubscriptionActionResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.IDEMPOTENCY_KEY_REQUIRED],
    403: [E.ADMIN_STEP_UP_REQUIRED],
    404: [E.SUBSCRIPTION_NOT_FOUND],
    409: [E.CONTENT_INVALID_STATE, E.IDEMPOTENCY_KEY_CONFLICT],
    503: [E.PAYMENTS_NOT_CONFIGURED],
  })
  async cancelAdminSubscription(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminSubscriptionUserParamDto,
    @Body() dto: AdminCancelSubscriptionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<AdminSubscriptionActionResultDto> {
    // Round 4 admin check (25.11, В4): a cancel that sends money back goes
    // through the same RefundsService as «Возврат» and asks the same: a
    // fresh 2FA code and a retry key (no second refund on a double click).
    if (dto.refund && dto.refund !== 'none') {
      if (!idempotencyKey || idempotencyKey.trim() === '') {
        throw new BadRequestException({
          code: E.IDEMPOTENCY_KEY_REQUIRED,
          message: 'A cancel with a refund requires an Idempotency-Key header.',
        });
      }
      await this.auth.assertStepUp(admin.sessionId);
    }
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
