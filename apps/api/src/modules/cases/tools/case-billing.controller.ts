import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Patch,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import {
  CurrentUser,
  type RequestUser,
} from '../../auth/decorators/current-user.decorator';
import { CaseIdParamDto } from '../dto/case-requests.dto';
import { CaseBillingService } from './case-billing.service';
import {
  AddExpenseDto,
  AddTimeDto,
  CaseBillingDto,
  EntryIdParamDto,
  InvoiceIdParamDto,
  IssueInvoiceDto,
  RecordInvoicePaymentDto,
  RunningTimerDto,
  SetRateDto,
  StopTimerDto,
  UpdateTimeDto,
} from './billing.dto';

const E = ErrorCode;
const ERR = {
  400: [E.VALIDATION_ERROR],
  403: [E.FORBIDDEN, E.ASSISTANT_NOT_ALLOWED],
  404: [E.CASE_NOT_FOUND, E.NOT_FOUND],
  409: [E.CASE_INVALID_STATE, E.VALIDATION_ERROR],
};

/** Owner 2026-10-20: time, expenses and invoices of an accepted case. */
@ApiTags('case-billing')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class CaseBillingController {
  constructor(private readonly billing: CaseBillingService) {}

  @Get('users/me/running-timer')
  @ApiOperation({ summary: 'The attorney’s running case timer, if any' })
  @ApiEnvelopeResponse(RunningTimerDto, {
    description: 'The timer, or null when none runs.',
  })
  runningTimer(@CurrentUser() u: RequestUser) {
    return this.billing.runningTimer(u);
  }

  @Get('cases/:id/billing')
  @ApiOperation({
    summary:
      'Attorney: rate, timer, time, expenses, totals and invoices. Client: invoices only',
  })
  @ApiEnvelopeResponse(CaseBillingDto)
  @ApiErrors(ERR)
  getCaseBilling(@CurrentUser() u: RequestUser, @Param() p: CaseIdParamDto) {
    return this.billing.get(u, p.id);
  }

  @Put('cases/:id/billing/rate')
  @ApiOperation({ summary: 'Attorney: the hourly rate of the case' })
  @ApiEnvelopeResponse(CaseBillingDto)
  @ApiErrors(ERR)
  setCaseRate(
    @CurrentUser() u: RequestUser,
    @Param() p: CaseIdParamDto,
    @Body() dto: SetRateDto,
  ) {
    return this.billing.setRate(u, p.id, dto.hourlyRateCents);
  }

  @Post('cases/:id/billing/timer/start')
  @HttpCode(200)
  @ApiOperation({ summary: 'Attorney: start the timer (one at a time)' })
  @ApiEnvelopeResponse(CaseBillingDto)
  @ApiErrors(ERR)
  startCaseTimer(@CurrentUser() u: RequestUser, @Param() p: CaseIdParamDto) {
    return this.billing.startTimer(u, p.id);
  }

  @Post('cases/:id/billing/timer/stop')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Attorney: stop the timer; it becomes a time entry',
  })
  @ApiEnvelopeResponse(CaseBillingDto)
  @ApiErrors(ERR)
  stopCaseTimer(
    @CurrentUser() u: RequestUser,
    @Param() p: CaseIdParamDto,
    @Body() dto: StopTimerDto,
  ) {
    return this.billing.stopTimer(u, p.id, dto.note);
  }

  @Post('cases/:id/billing/time')
  @ApiOperation({ summary: 'Attorney: add time by hand' })
  @ApiEnvelopeResponse(CaseBillingDto)
  @ApiErrors(ERR)
  addCaseTime(
    @CurrentUser() u: RequestUser,
    @Param() p: CaseIdParamDto,
    @Body() dto: AddTimeDto,
  ) {
    return this.billing.addTime(u, p.id, dto);
  }

  @Patch('cases/:id/billing/time/:entryId')
  @ApiOperation({ summary: 'Attorney: edit a time entry not yet invoiced' })
  @ApiEnvelopeResponse(CaseBillingDto)
  @ApiErrors(ERR)
  updateCaseTime(
    @CurrentUser() u: RequestUser,
    @Param() p: EntryIdParamDto,
    @Body() dto: UpdateTimeDto,
  ) {
    return this.billing.updateTime(u, p.id, p.entryId, dto);
  }

  @Delete('cases/:id/billing/time/:entryId')
  @ApiOperation({ summary: 'Attorney: delete a time entry not yet invoiced' })
  @ApiEnvelopeResponse(CaseBillingDto)
  @ApiErrors(ERR)
  deleteCaseTime(@CurrentUser() u: RequestUser, @Param() p: EntryIdParamDto) {
    return this.billing.deleteTime(u, p.id, p.entryId);
  }

  @Post('cases/:id/billing/expenses')
  @ApiOperation({ summary: 'Attorney: add an expense, with a receipt photo' })
  @ApiEnvelopeResponse(CaseBillingDto)
  @ApiErrors(ERR)
  addCaseExpense(
    @CurrentUser() u: RequestUser,
    @Param() p: CaseIdParamDto,
    @Body() dto: AddExpenseDto,
  ) {
    return this.billing.addExpense(u, p.id, dto);
  }

  @Delete('cases/:id/billing/expenses/:entryId')
  @ApiOperation({ summary: 'Attorney: delete an expense not yet invoiced' })
  @ApiEnvelopeResponse(CaseBillingDto)
  @ApiErrors(ERR)
  deleteCaseExpense(
    @CurrentUser() u: RequestUser,
    @Param() p: EntryIdParamDto,
  ) {
    return this.billing.deleteExpense(u, p.id, p.entryId);
  }

  @Post('cases/:id/billing/invoices')
  @ApiOperation({
    summary:
      'Attorney: an invoice document (PDF, no payment) from everything not yet billed; a line in the case chat',
  })
  @ApiEnvelopeResponse(CaseBillingDto)
  @ApiErrors(ERR)
  issueCaseInvoice(
    @CurrentUser() u: RequestUser,
    @Param() p: CaseIdParamDto,
    @Body() dto: IssueInvoiceDto,
  ) {
    return this.billing.issueInvoice(u, p.id, dto);
  }

  @Post('cases/:id/billing/invoices/:invoiceId/send')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Attorney: send a draft invoice (the client sees it now)',
  })
  @ApiEnvelopeResponse(CaseBillingDto)
  @ApiErrors(ERR)
  sendCaseInvoice(
    @CurrentUser() u: RequestUser,
    @Param() p: InvoiceIdParamDto,
  ) {
    return this.billing.sendInvoice(u, p.id, p.invoiceId);
  }

  @Post('cases/:id/billing/invoices/:invoiceId/void')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Attorney: void an unpaid invoice; its time and expenses become billable again',
  })
  @ApiEnvelopeResponse(CaseBillingDto)
  @ApiErrors(ERR)
  voidCaseInvoice(
    @CurrentUser() u: RequestUser,
    @Param() p: InvoiceIdParamDto,
  ) {
    return this.billing.voidInvoice(u, p.id, p.invoiceId);
  }

  @Post('cases/:id/billing/invoices/:invoiceId/remind')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Attorney: remind the client about an unpaid invoice now',
  })
  @ApiEnvelopeResponse(CaseBillingDto)
  @ApiErrors(ERR)
  remindCaseInvoice(
    @CurrentUser() u: RequestUser,
    @Param() p: InvoiceIdParamDto,
  ) {
    return this.billing.remindInvoice(u, p.id, p.invoiceId);
  }

  @Post('cases/:id/billing/invoices/:invoiceId/payment')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Attorney: record money received outside the app (partially paid / paid)',
  })
  @ApiEnvelopeResponse(CaseBillingDto)
  @ApiErrors(ERR)
  recordCaseInvoicePayment(
    @CurrentUser() u: RequestUser,
    @Param() p: InvoiceIdParamDto,
    @Body() dto: RecordInvoicePaymentDto,
  ) {
    return this.billing.recordPayment(u, p.id, p.invoiceId, dto);
  }
}
