import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
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
import { AdminCasePaymentsService } from './admin-case-payments.service';
import {
  AdminCasePaymentRowDto,
  AdminCasePaymentsQueryDto,
  AdminCasePaymentStatsDto,
  AdminPaymentRequestsQueryDto,
  AdminPaymentSettingsDto,
  AdminPaymentSettingsViewDto,
  AdminPayoutAccountActionResultDto,
  AdminPayoutAccountRowDto,
  AdminPayoutAccountsQueryDto,
  AdminPayoutAccountUserParamDto,
  AdminRefundCasePaymentDto,
  PaymentRequestDto,
  CasePaymentIdParamDto,
} from './case-payments.dto';

const E = ErrorCode;
type Page<T> = { items: T[]; nextCursor: string | null };

/** Owner 2026-10-05: client → attorney payments in the admin. Money is a
 * super-admin-only area (owner 2026-10-02), so every route here is closed
 * for the other roles in the API itself. CSV: GET
 * /admin/export/case_payments. */
@ApiTags('admin-case-payments')
@AdminEndpoint('super_admin')
@Controller('admin/case-payments')
export class AdminCasePaymentsController {
  constructor(private readonly payments: AdminCasePaymentsService) {}

  @Get()
  @ApiOperation({ summary: 'Client → attorney payments, newest first' })
  @ApiEnvelopeResponse(AdminCasePaymentRowDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listAdminCasePayments(
    @Query() q: AdminCasePaymentsQueryDto,
  ): Promise<Page<AdminCasePaymentRowDto>> {
    return this.payments.list(q);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Volume, platform fees, disputes, accounts' })
  @ApiEnvelopeResponse(AdminCasePaymentStatsDto)
  getAdminCasePaymentStats(): Promise<AdminCasePaymentStatsDto> {
    return this.payments.stats();
  }

  @Get('settings')
  @ApiOperation({ summary: 'Fee rules for client → attorney payments' })
  @ApiEnvelopeResponse(AdminPaymentSettingsViewDto)
  getCasePaymentSettings(): Promise<AdminPaymentSettingsViewDto> {
    return this.payments.getSettings();
  }

  @Roles('super_admin')
  @Put('settings')
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      'Change the platform fee (type / amount / who pays) and limits (super admin)',
  })
  @ApiEnvelopeResponse(AdminPaymentSettingsViewDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  updateCasePaymentSettings(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: AdminPaymentSettingsDto,
  ): Promise<AdminPaymentSettingsViewDto> {
    return this.payments.updateSettings(admin, dto);
  }

  @Get('requests')
  @ApiOperation({ summary: 'Payment requests (invoices) from attorneys' })
  @ApiEnvelopeResponse(PaymentRequestDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listRequests(
    @Query() q: AdminPaymentRequestsQueryDto,
  ): Promise<Page<PaymentRequestDto>> {
    return this.payments.listRequests(q);
  }

  @Get('payout-accounts')
  @ApiOperation({ summary: "Attorneys' Stripe payout accounts" })
  @ApiEnvelopeResponse(AdminPayoutAccountRowDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listAdminPayoutAccounts(
    @Query() q: AdminPayoutAccountsQueryDto,
  ): Promise<Page<AdminPayoutAccountRowDto>> {
    return this.payments.listPayoutAccounts(q);
  }

  @Roles('super_admin', 'finance')
  @Post('payout-accounts/:userId/sync')
  @HttpCode(HttpStatus.OK)
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Re-read the account status from Stripe' })
  @ApiEnvelopeResponse(AdminPayoutAccountActionResultDto)
  @ApiErrors({ 404: [E.NOT_FOUND], 503: [E.PAYMENTS_NOT_CONFIGURED] })
  syncAdminPayoutAccount(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminPayoutAccountUserParamDto,
  ): Promise<AdminPayoutAccountActionResultDto> {
    return this.payments.syncPayoutAccount(admin, p.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One payment with its refunds' })
  @ApiEnvelopeResponse(AdminCasePaymentRowDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  getAdminCasePayment(
    @Param() p: CasePaymentIdParamDto,
  ): Promise<AdminCasePaymentRowDto> {
    return this.payments.get(p.id);
  }

  @Roles('super_admin', 'finance')
  @Post(':id/refund')
  @HttpCode(HttpStatus.OK)
  @SkipAutoAudit()
  @ApiOperation({
    summary: "Refund the client on the attorney's behalf (full or partial)",
  })
  @ApiEnvelopeResponse(AdminCasePaymentRowDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.PAYMENT_AMOUNT_INVALID],
    404: [E.NOT_FOUND],
    409: [E.PAYMENT_INVALID_STATE],
    503: [E.PAYMENTS_NOT_CONFIGURED],
  })
  refundAdminCasePayment(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: CasePaymentIdParamDto,
    @Body() dto: AdminRefundCasePaymentDto,
  ): Promise<AdminCasePaymentRowDto> {
    return this.payments.refund(admin, p.id, dto);
  }
}
