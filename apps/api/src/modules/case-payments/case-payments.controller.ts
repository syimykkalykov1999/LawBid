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
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
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
  CasePaymentCaseParamDto,
  CasePaymentDto,
  CasePaymentIdParamDto,
  CasePaymentsStateDto,
  CreateCasePaymentDto,
  CreateCasePaymentResultDto,
  CreatePaymentRequestsDto,
  FeePayerAnswerDto,
  MyCasePaymentsQueryDto,
  MyCasePaymentsSummaryDto,
  PaymentQuoteDto,
  PaymentQuoteQueryDto,
  PaymentRequestDto,
  PaymentRequestIdParamDto,
  PaymentsExportQueryDto,
  PaymentSettingsPublicDto,
  PayoutAccountDto,
  PayoutPreferencesDto,
  PayoutAccountLinkDto,
  RefundCasePaymentDto,
} from './case-payments.dto';
import { CasePaymentsService } from './case-payments.service';

const E = ErrorCode;
type Page<T> = { items: T[]; nextCursor: string | null };

/** Owner 2026-10-05: the client pays the attorney at work on their case
 * through the platform (Stripe Connect, money goes straight to the
 * attorney's account). Everything is behind the `payments_in_app` flag. */
@ApiTags('case-payments')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class CasePaymentsController {
  constructor(private readonly payments: CasePaymentsService) {}

  @Get('payments/settings')
  @ApiOperation({ summary: 'Are in-app payments on, fee rules, limits' })
  @ApiEnvelopeResponse(PaymentSettingsPublicDto)
  getPaymentSettings(): Promise<PaymentSettingsPublicDto> {
    return this.payments.publicSettings();
  }

  @Get('payments/quote')
  @ApiOperation({ summary: 'What the client pays for an amount, fees split' })
  @ApiEnvelopeResponse(PaymentQuoteDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FEATURE_DISABLED] })
  getPaymentQuote(
    @CurrentUser() user: RequestUser,
    @Query() q: PaymentQuoteQueryDto,
  ): Promise<PaymentQuoteDto> {
    return this.payments.quote(user, q);
  }

  // ---- attorney: payout account ---------------------------------------------

  @Get('payout-account')
  @ApiOperation({ summary: 'My Stripe payout account status (attorney)' })
  @ApiEnvelopeResponse(PayoutAccountDto)
  @ApiErrors({ 403: [E.FORBIDDEN] })
  getPayoutAccount(
    @CurrentUser() user: RequestUser,
  ): Promise<PayoutAccountDto> {
    return this.payments.payoutAccount(user);
  }

  @Put('payout-account/preferences')
  @ApiOperation({
    summary: "Who covers Stripe's fee on my invoices by default (attorney)",
  })
  @ApiEnvelopeResponse(PayoutAccountDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN],
    409: [E.PAYOUT_ACCOUNT_NOT_READY],
  })
  updatePayoutPreferences(
    @CurrentUser() user: RequestUser,
    @Body() dto: PayoutPreferencesDto,
  ): Promise<PayoutAccountDto> {
    return this.payments.updatePreferences(user, dto);
  }

  @Post('payout-account/onboarding')
  @ApiOperation({
    summary: 'Start or continue Stripe onboarding; returns the page to open',
  })
  @ApiEnvelopeResponse(PayoutAccountLinkDto, { status: 201 })
  @ApiErrors({
    403: [
      E.FORBIDDEN,
      E.FEATURE_DISABLED,
      E.ENTITLEMENT_REQUIRED,
      E.COUNTRY_NOT_AVAILABLE,
    ],
    503: [E.PAYMENTS_NOT_CONFIGURED],
  })
  startPayoutOnboarding(
    @CurrentUser() user: RequestUser,
  ): Promise<PayoutAccountLinkDto> {
    return this.payments.startOnboarding(user);
  }

  @Post('payout-account/dashboard')
  @ApiOperation({ summary: 'One-time link to the Stripe Express dashboard' })
  @ApiEnvelopeResponse(PayoutAccountLinkDto, { status: 201 })
  @ApiErrors({
    403: [E.FORBIDDEN],
    409: [E.PAYOUT_ACCOUNT_NOT_READY],
    503: [E.PAYMENTS_NOT_CONFIGURED],
  })
  getPayoutDashboard(
    @CurrentUser() user: RequestUser,
  ): Promise<PayoutAccountLinkDto> {
    return this.payments.dashboardLink(user);
  }

  // ---- a case's payments ----------------------------------------------------

  @Get('cases/:id/payments')
  @ApiOperation({
    summary:
      "A case's payments and whether the client can pay now (both sides)",
  })
  @ApiEnvelopeResponse(CasePaymentsStateDto)
  @ApiErrors({ 404: [E.CASE_NOT_FOUND] })
  getCasePayments(
    @CurrentUser() user: RequestUser,
    @Param() p: CasePaymentCaseParamDto,
  ): Promise<CasePaymentsStateDto> {
    return this.payments.caseState(user, p.id);
  }

  @Post('cases/:id/payments')
  @UseGuards(RequireIdempotencyKeyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary: 'Pay the attorney (bid, deposit, balance or a custom amount)',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Required: a retry with the same key and body returns the first result instead of a second checkout.',
  })
  @ApiEnvelopeResponse(CreateCasePaymentResultDto, { status: 201 })
  @ApiErrors({
    400: [
      E.VALIDATION_ERROR,
      E.PAYMENT_AMOUNT_INVALID,
      E.IDEMPOTENCY_KEY_REQUIRED,
    ],
    403: [E.FORBIDDEN, E.FEATURE_DISABLED],
    404: [E.CASE_NOT_FOUND],
    409: [
      E.CASE_INVALID_STATE,
      E.PAYOUT_ACCOUNT_NOT_READY,
      E.IDEMPOTENCY_KEY_CONFLICT,
    ],
    503: [E.PAYMENTS_NOT_CONFIGURED],
  })
  createCasePayment(
    @CurrentUser() user: RequestUser,
    @Param() p: CasePaymentCaseParamDto,
    @Body() dto: CreateCasePaymentDto,
  ): Promise<CreateCasePaymentResultDto> {
    return this.payments.create(user, p.id, dto);
  }

  // ---- payment requests (invoices) -----------------------------------------

  @Post('cases/:id/payment-requests')
  @ApiOperation({
    summary:
      'Ask the client to pay: one request or an installment plan (attorney)',
  })
  @ApiEnvelopeResponse(PaymentRequestDto, { isArray: true, status: 201 })
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.PAYMENT_AMOUNT_INVALID],
    403: [E.FORBIDDEN, E.FEATURE_DISABLED, E.ENTITLEMENT_REQUIRED],
    404: [E.CASE_NOT_FOUND],
    409: [E.CASE_INVALID_STATE, E.PAYOUT_ACCOUNT_NOT_READY],
  })
  createPaymentRequests(
    @CurrentUser() user: RequestUser,
    @Param() p: CasePaymentCaseParamDto,
    @Body() dto: CreatePaymentRequestsDto,
  ): Promise<PaymentRequestDto[]> {
    return this.payments.createRequests(user, p.id, dto);
  }

  @Get('cases/:id/payment-requests')
  @ApiOperation({ summary: "A case's payment requests, newest first" })
  @ApiEnvelopeResponse(PaymentRequestDto, { isArray: true })
  @ApiErrors({ 404: [E.CASE_NOT_FOUND] })
  listPaymentRequests(
    @CurrentUser() user: RequestUser,
    @Param() p: CasePaymentCaseParamDto,
  ): Promise<PaymentRequestDto[]> {
    return this.payments.listRequests(user, p.id);
  }

  @Post('payment-requests/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Withdraw an open payment request (attorney)' })
  @ApiEnvelopeResponse(PaymentRequestDto)
  @ApiErrors({ 404: [E.NOT_FOUND], 409: [E.PAYMENT_INVALID_STATE] })
  cancelPaymentRequest(
    @CurrentUser() user: RequestUser,
    @Param() p: PaymentRequestIdParamDto,
  ): Promise<PaymentRequestDto> {
    return this.payments.cancelRequest(user, p.id);
  }

  @Post('payment-requests/:id/fee-payer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Who covers the Stripe fee: accept the other side's proposal or counter (like a bid)",
  })
  @ApiEnvelopeResponse(PaymentRequestDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.PAYMENT_INVALID_STATE, E.PAYMENT_FEE_MAX_ROUNDS_REACHED],
  })
  answerFeePayer(
    @CurrentUser() user: RequestUser,
    @Param() p: PaymentRequestIdParamDto,
    @Body() dto: FeePayerAnswerDto,
  ): Promise<PaymentRequestDto> {
    return this.payments.answerFeePayer(user, p.id, dto);
  }

  // ---- documents --------------------------------------------------------------

  @Get('payments/export.csv')
  @ApiOperation({
    summary:
      'My payments as CSV for bookkeeping (attorney: received; client: paid)',
  })
  @ApiProduces('text/csv')
  @ApiResponse({ status: 200, description: 'CSV file.' })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  async exportMyCasePayments(
    @CurrentUser() user: RequestUser,
    @Query() q: PaymentsExportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.payments.exportCsv(user, q);
    res
      .type('text/csv')
      .setHeader(
        'Content-Disposition',
        `attachment; filename="lawbid-payments-${new Date().toISOString().slice(0, 10)}.csv"`,
      )
      .send(csv);
  }

  @Get('payments/:id/receipt.pdf')
  @ApiOperation({ summary: 'PDF receipt of one of my payments (both sides)' })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'PDF file.' })
  @ApiErrors({ 404: [E.NOT_FOUND], 409: [E.PAYMENT_INVALID_STATE] })
  async getCasePaymentReceipt(
    @CurrentUser() user: RequestUser,
    @Param() p: CasePaymentIdParamDto,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.payments.receiptPdf(user, p.id);
    res
      .type('application/pdf')
      .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      .send(buffer);
  }

  // ---- single payment -------------------------------------------------------

  @Get('payments/history')
  @ApiOperation({ summary: 'My case payments, newest first (both sides)' })
  @ApiEnvelopeResponse(CasePaymentDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listMyCasePayments(
    @CurrentUser() user: RequestUser,
    @Query() q: MyCasePaymentsQueryDto,
  ): Promise<Page<CasePaymentDto>> {
    return this.payments.myPayments(user, q);
  }

  @Get('payments/summary')
  @ApiOperation({ summary: 'Paid / received this calendar year' })
  @ApiEnvelopeResponse(MyCasePaymentsSummaryDto)
  getMyCasePaymentsSummary(
    @CurrentUser() user: RequestUser,
  ): Promise<MyCasePaymentsSummaryDto> {
    return this.payments.mySummary(user);
  }

  @Get('payments/:id')
  @ApiOperation({ summary: 'One of my payments' })
  @ApiEnvelopeResponse(CasePaymentDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  getCasePayment(
    @CurrentUser() user: RequestUser,
    @Param() p: CasePaymentIdParamDto,
  ): Promise<CasePaymentDto> {
    return this.payments.getPayment(user, p.id);
  }

  @Post('payments/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Drop a payment that was not completed (client)' })
  @ApiEnvelopeResponse(CasePaymentDto)
  @ApiErrors({ 404: [E.NOT_FOUND], 409: [E.PAYMENT_INVALID_STATE] })
  cancelCasePayment(
    @CurrentUser() user: RequestUser,
    @Param() p: CasePaymentIdParamDto,
  ): Promise<CasePaymentDto> {
    return this.payments.cancel(user, p.id);
  }

  @Post('payments/:id/refund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Give money back to the client, fully or in part (attorney)',
  })
  @ApiEnvelopeResponse(CasePaymentDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.PAYMENT_AMOUNT_INVALID],
    403: [E.FORBIDDEN],
    404: [E.NOT_FOUND],
    409: [E.PAYMENT_INVALID_STATE, E.REFUND_NOT_ALLOWED],
    503: [E.PAYMENTS_NOT_CONFIGURED],
  })
  refundCasePayment(
    @CurrentUser() user: RequestUser,
    @Param() p: CasePaymentIdParamDto,
    @Body() dto: RefundCasePaymentDto,
  ): Promise<CasePaymentDto> {
    return this.payments.refund(user, p.id, dto);
  }
}
