// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/add_expense_dto.dart';
import '../models/add_time_dto.dart';
import '../models/case_billing_envelope.dart';
import '../models/issue_invoice_dto.dart';
import '../models/record_invoice_payment_dto.dart';
import '../models/running_timer_envelope.dart';
import '../models/set_rate_dto.dart';
import '../models/stop_timer_dto.dart';
import '../models/update_time_dto.dart';

part 'case_billing_client.g.dart';

@RestApi()
abstract class CaseBillingClient {
  factory CaseBillingClient(Dio dio, {String? baseUrl}) = _CaseBillingClient;

  /// The attorney’s running case timer, if any
  @GET('/users/me/running-timer')
  Future<RunningTimerEnvelope> runningTimer({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Attorney: rate, timer, time, expenses, totals and invoices. Client: invoices only
  @GET('/cases/{id}/billing')
  Future<CaseBillingEnvelope> getCaseBilling({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Attorney: the hourly rate of the case
  @PUT('/cases/{id}/billing/rate')
  Future<CaseBillingEnvelope> setCaseRate({
    @Path('id') required String id,
    @Body() required SetRateDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Attorney: start the timer (one at a time)
  @POST('/cases/{id}/billing/timer/start')
  Future<CaseBillingEnvelope> startCaseTimer({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Attorney: stop the timer; it becomes a time entry
  @POST('/cases/{id}/billing/timer/stop')
  Future<CaseBillingEnvelope> stopCaseTimer({
    @Path('id') required String id,
    @Body() required StopTimerDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Attorney: add time by hand
  @POST('/cases/{id}/billing/time')
  Future<CaseBillingEnvelope> addCaseTime({
    @Path('id') required String id,
    @Body() required AddTimeDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Attorney: edit a time entry not yet invoiced
  @PATCH('/cases/{id}/billing/time/{entryId}')
  Future<CaseBillingEnvelope> updateCaseTime({
    @Path('id') required String id,
    @Path('entryId') required String entryId,
    @Body() required UpdateTimeDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Attorney: delete a time entry not yet invoiced
  @DELETE('/cases/{id}/billing/time/{entryId}')
  Future<CaseBillingEnvelope> deleteCaseTime({
    @Path('id') required String id,
    @Path('entryId') required String entryId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Attorney: add an expense, with a receipt photo
  @POST('/cases/{id}/billing/expenses')
  Future<CaseBillingEnvelope> addCaseExpense({
    @Path('id') required String id,
    @Body() required AddExpenseDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Attorney: delete an expense not yet invoiced
  @DELETE('/cases/{id}/billing/expenses/{entryId}')
  Future<CaseBillingEnvelope> deleteCaseExpense({
    @Path('id') required String id,
    @Path('entryId') required String entryId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Attorney: an invoice document (PDF, no payment) from everything not yet billed; a line in the case chat
  @POST('/cases/{id}/billing/invoices')
  Future<CaseBillingEnvelope> issueCaseInvoice({
    @Path('id') required String id,
    @Body() required IssueInvoiceDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Attorney: send a draft invoice (the client sees it now)
  @POST('/cases/{id}/billing/invoices/{invoiceId}/send')
  Future<CaseBillingEnvelope> sendCaseInvoice({
    @Path('id') required String id,
    @Path('invoiceId') required String invoiceId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Attorney: void an unpaid invoice; its time and expenses become billable again
  @POST('/cases/{id}/billing/invoices/{invoiceId}/void')
  Future<CaseBillingEnvelope> voidCaseInvoice({
    @Path('id') required String id,
    @Path('invoiceId') required String invoiceId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Attorney: remind the client about an unpaid invoice now
  @POST('/cases/{id}/billing/invoices/{invoiceId}/remind')
  Future<CaseBillingEnvelope> remindCaseInvoice({
    @Path('id') required String id,
    @Path('invoiceId') required String invoiceId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Attorney: record money received outside the app (partially paid / paid)
  @POST('/cases/{id}/billing/invoices/{invoiceId}/payment')
  Future<CaseBillingEnvelope> recordCaseInvoicePayment({
    @Path('id') required String id,
    @Path('invoiceId') required String invoiceId,
    @Body() required RecordInvoicePaymentDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
