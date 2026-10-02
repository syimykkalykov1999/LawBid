import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';
import { RequireIdempotencyKeyGuard } from '../../idempotency/require-idempotency-key.guard';
import {
  AdminEndpoint,
  CurrentAdmin,
  Roles,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  AdminBillingCursorQueryDto,
  AdminBillingIdParamDto,
  AdminBillingReasonDto,
  AdminBillingSubscriptionRowDto,
  AdminBillingSubscriptionsQueryDto,
  AdminBillingUserParamDto,
  AdminGrantsQueryDto,
  AdminPaymentDto,
  AdminPaymentsQueryDto,
  AdminPromoQueryDto,
  AdminRefundsQueryDto,
  BillingOverviewDto,
  ContractGrantDto,
  CreateContractGrantDto,
  CreatePromoCodeDto,
  CreateRefundDto,
  ExtendContractGrantDto,
  PromoCodeDto,
  PromoRedemptionDto,
  RefundDto,
  UpdatePromoCodeDto,
} from './admin-billing.dto';
import type { Page } from './admin-billing.util';
import { BillingOverviewService } from './billing-overview.service';
import { ContractGrantsService } from './contract-grants.service';
import { PromoCodesService } from './promo-codes.service';
import { RefundsService } from './refunds.service';

const E = ErrorCode;

/**
 * Owner 2026-10-02: admin billing tools — contract (free) subscriptions,
 * promo codes, payments + refunds, the billing dashboard. super_admin and
 * finance act, support reads. Every change writes its own audit_log row
 * (before/after, reason), hence @SkipAutoAudit.
 */
@ApiTags('admin-billing')
@AdminEndpoint('super_admin', 'finance', 'support')
@SkipAutoAudit()
@Controller('admin/billing')
export class AdminBillingController {
  constructor(
    private readonly overviewService: BillingOverviewService,
    private readonly grants: ContractGrantsService,
    private readonly promos: PromoCodesService,
    private readonly refundsService: RefundsService,
  ) {}

  // --- dashboard -------------------------------------------------------------

  @Get('overview')
  @ApiOperation({
    summary: 'MRR, subscription counts, grants, 30-day revenue and refunds',
  })
  @ApiEnvelopeResponse(BillingOverviewDto)
  getBillingOverview(): Promise<BillingOverviewDto> {
    return this.overviewService.overview();
  }

  @Get('subscriptions')
  @ApiOperation({
    summary: 'Subscriptions with user, seats and grant (cursor)',
  })
  @ApiEnvelopeResponse(AdminBillingSubscriptionRowDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listBillingSubscriptions(
    @Query() q: AdminBillingSubscriptionsQueryDto,
  ): Promise<Page<AdminBillingSubscriptionRowDto>> {
    return this.overviewService.subscriptions(q);
  }

  // --- contract grants ------------------------------------------------------

  @Get('contract-grants')
  @ApiOperation({ summary: 'Contract (free) subscriptions, newest first' })
  @ApiEnvelopeResponse(ContractGrantDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listContractGrants(
    @Query() q: AdminGrantsQueryDto,
  ): Promise<Page<ContractGrantDto>> {
    return this.grants.list(q);
  }

  @Get('contract-grants/users/:userId')
  @ApiOperation({
    summary: "An attorney's contract grants (all, newest first)",
  })
  @ApiEnvelopeResponse(ContractGrantDto, { isArray: true })
  getUserContractGrants(
    @Param() p: AdminBillingUserParamDto,
  ): Promise<ContractGrantDto[]> {
    return this.grants.forUser(p.userId);
  }

  @Post('contract-grants')
  @Roles('super_admin', 'finance')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({
    summary: 'Give an attorney a free subscription for 3–12 months',
  })
  @ApiEnvelopeResponse(ContractGrantDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.CONTRACT_GRANT_NOT_ATTORNEY, E.IDEMPOTENCY_KEY_CONFLICT],
  })
  createContractGrant(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: CreateContractGrantDto,
  ): Promise<ContractGrantDto> {
    return this.grants.create(admin, dto);
  }

  @Post('contract-grants/:id/extend')
  @Roles('super_admin', 'finance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add months to a grant (24 months at most)' })
  @ApiEnvelopeResponse(ContractGrantDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.CONTRACT_GRANT_REVOKED],
  })
  extendContractGrant(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminBillingIdParamDto,
    @Body() dto: ExtendContractGrantDto,
  ): Promise<ContractGrantDto> {
    return this.grants.extend(admin, p.id, dto.months, dto.reason);
  }

  @Post('contract-grants/:id/revoke')
  @Roles('super_admin', 'finance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a grant now (reason ≥ 10 chars)' })
  @ApiEnvelopeResponse(ContractGrantDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.CONTRACT_GRANT_REVOKED],
  })
  revokeContractGrant(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminBillingIdParamDto,
    @Body() dto: AdminBillingReasonDto,
  ): Promise<ContractGrantDto> {
    return this.grants.revoke(admin, p.id, dto.reason);
  }

  // --- promo codes ------------------------------------------------------------

  @Get('promo-codes')
  @ApiOperation({ summary: 'Promo codes, newest first' })
  @ApiEnvelopeResponse(PromoCodeDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listPromoCodes(@Query() q: AdminPromoQueryDto): Promise<Page<PromoCodeDto>> {
    return this.promos.list(q);
  }

  @Post('promo-codes')
  @Roles('super_admin', 'finance')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({
    summary: 'Create a promo code (+ a Stripe coupon when configured)',
  })
  @ApiEnvelopeResponse(PromoCodeDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    409: [E.PROMO_CODE_EXISTS, E.IDEMPOTENCY_KEY_CONFLICT],
  })
  createPromoCode(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: CreatePromoCodeDto,
  ): Promise<PromoCodeDto> {
    return this.promos.create(admin, dto);
  }

  @Patch('promo-codes/:id')
  @Roles('super_admin', 'finance')
  @ApiOperation({
    summary: 'Edit description, active, max redemptions, expiry',
  })
  @ApiEnvelopeResponse(PromoCodeDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  updatePromoCode(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminBillingIdParamDto,
    @Body() dto: UpdatePromoCodeDto,
  ): Promise<PromoCodeDto> {
    return this.promos.update(admin, p.id, dto);
  }

  @Post('promo-codes/:id/deactivate')
  @Roles('super_admin', 'finance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Switch a promo code off' })
  @ApiEnvelopeResponse(PromoCodeDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  deactivatePromoCode(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminBillingIdParamDto,
  ): Promise<PromoCodeDto> {
    return this.promos.deactivate(admin, p.id);
  }

  @Get('promo-codes/:id/redemptions')
  @ApiOperation({ summary: 'Who used a promo code (cursor)' })
  @ApiEnvelopeResponse(PromoRedemptionDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  listPromoRedemptions(
    @Param() p: AdminBillingIdParamDto,
    @Query() q: AdminBillingCursorQueryDto,
  ): Promise<Page<PromoRedemptionDto>> {
    return this.promos.redemptions(p.id, q.cursor);
  }

  // --- payments & refunds -----------------------------------------------------

  @Get('payments')
  @ApiOperation({ summary: 'Payments with refunded amounts (cursor)' })
  @ApiEnvelopeResponse(AdminPaymentDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listBillingPayments(
    @Query() q: AdminPaymentsQueryDto,
  ): Promise<Page<AdminPaymentDto>> {
    return this.refundsService.payments(q);
  }

  @Get('refunds')
  @ApiOperation({ summary: 'Refunds, newest first (cursor)' })
  @ApiEnvelopeResponse(RefundDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listBillingRefunds(
    @Query() q: AdminRefundsQueryDto,
  ): Promise<Page<RefundDto>> {
    return this.refundsService.refunds(q);
  }

  @Post('refunds')
  @Roles('super_admin', 'finance')
  @UseGuards(RequireIdempotencyKeyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Required: a retry returns the first refund, never a second.',
  })
  @ApiOperation({
    summary: 'Refund part or all of a payment (reason ≥ 10 chars)',
  })
  @ApiEnvelopeResponse(RefundDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.IDEMPOTENCY_KEY_REQUIRED],
    404: [E.NOT_FOUND],
    409: [
      E.REFUND_AMOUNT_EXCEEDED,
      E.REFUND_NOT_ALLOWED,
      E.IDEMPOTENCY_KEY_CONFLICT,
    ],
    502: [E.REFUND_PROVIDER_FAILED],
    503: [E.PAYMENTS_NOT_CONFIGURED],
  })
  createRefund(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: CreateRefundDto,
  ): Promise<RefundDto> {
    return this.refundsService.refund(admin, dto);
  }
}
