// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/case_payment_envelope.dart';
import '../models/case_payment_list_envelope.dart';
import '../models/case_payment_status.dart';
import '../models/case_payments_state_envelope.dart';
import '../models/create_case_payment_dto.dart';
import '../models/create_case_payment_result_envelope.dart';
import '../models/create_payment_requests_dto.dart';
import '../models/fee_payer_answer_dto.dart';
import '../models/my_case_payments_summary_envelope.dart';
import '../models/payment_quote_envelope.dart';
import '../models/payment_request_envelope.dart';
import '../models/payment_request_list_envelope.dart';
import '../models/payment_settings_public_envelope.dart';
import '../models/payout_account_envelope.dart';
import '../models/payout_account_link_envelope.dart';
import '../models/payout_preferences_dto.dart';
import '../models/processing_fee_payer.dart';
import '../models/refund_case_payment_dto.dart';

part 'case_payments_client.g.dart';

@RestApi()
abstract class CasePaymentsClient {
  factory CasePaymentsClient(Dio dio, {String? baseUrl}) = _CasePaymentsClient;

  /// Are in-app payments on, fee rules, limits
  @GET('/payments/settings')
  Future<PaymentSettingsPublicEnvelope> getPaymentSettings({
    @Extras() Map<String, dynamic>? extras,
  });

  /// What the client pays for an amount, fees split.
  ///
  /// [caseId] - Quote for this case: the attorney's fee-payer choice applies.
  ///
  /// [processingFeePayer] - Preview a specific choice (attorney composing an invoice).
  @GET('/payments/quote')
  Future<PaymentQuoteEnvelope> getPaymentQuote({
    @Query('amountCents') required int amountCents,
    @Query('caseId') String? caseId,
    @Query('processingFeePayer') ProcessingFeePayer? processingFeePayer,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My Stripe payout account status (attorney)
  @GET('/payout-account')
  Future<PayoutAccountEnvelope> getPayoutAccount({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Who covers Stripe's fee on my invoices by default (attorney)
  @PUT('/payout-account/preferences')
  Future<PayoutAccountEnvelope> updatePayoutPreferences({
    @Body() required PayoutPreferencesDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Start or continue Stripe onboarding; returns the page to open
  @POST('/payout-account/onboarding')
  Future<PayoutAccountLinkEnvelope> startPayoutOnboarding({
    @Extras() Map<String, dynamic>? extras,
  });

  /// One-time link to the Stripe Express dashboard
  @POST('/payout-account/dashboard')
  Future<PayoutAccountLinkEnvelope> getPayoutDashboard({
    @Extras() Map<String, dynamic>? extras,
  });

  /// A case's payments and whether the client can pay now (both sides)
  @GET('/cases/{id}/payments')
  Future<CasePaymentsStateEnvelope> getCasePayments({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Pay the attorney (bid, deposit, balance or a custom amount)
  @POST('/cases/{id}/payments')
  Future<CreateCasePaymentResultEnvelope> createCasePayment({
    @Path('id') required String id,
    @Body() required CreateCasePaymentDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Ask the client to pay: one request or an installment plan (attorney)
  @POST('/cases/{id}/payment-requests')
  Future<PaymentRequestListEnvelope> createPaymentRequests({
    @Path('id') required String id,
    @Body() required CreatePaymentRequestsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// A case's payment requests, newest first
  @GET('/cases/{id}/payment-requests')
  Future<PaymentRequestListEnvelope> listPaymentRequests({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Withdraw an open payment request (attorney)
  @POST('/payment-requests/{id}/cancel')
  Future<PaymentRequestEnvelope> cancelPaymentRequest({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Who covers the Stripe fee: accept the other side's proposal or counter (like a bid)
  @POST('/payment-requests/{id}/fee-payer')
  Future<PaymentRequestEnvelope> answerFeePayer({
    @Path('id') required String id,
    @Body() required FeePayerAnswerDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My payments as CSV for bookkeeping (attorney: received; client: paid)
  @GET('/payments/export.csv')
  Future<void> exportMyCasePayments({
    @Query('from') DateTime? from,
    @Query('to') DateTime? to,
    @Extras() Map<String, dynamic>? extras,
  });

  /// PDF receipt of one of my payments (both sides)
  @GET('/payments/{id}/receipt.pdf')
  Future<void> getCasePaymentReceipt({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My case payments, newest first (both sides).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/payments/history')
  Future<CasePaymentListEnvelope> listMyCasePayments({
    @Query('cursor') String? cursor,
    @Query('status') CasePaymentStatus? status,
    @Query('caseId') String? caseId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Paid / received this calendar year
  @GET('/payments/summary')
  Future<MyCasePaymentsSummaryEnvelope> getMyCasePaymentsSummary({
    @Extras() Map<String, dynamic>? extras,
  });

  /// One of my payments
  @GET('/payments/{id}')
  Future<CasePaymentEnvelope> getCasePayment({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Drop a payment that was not completed (client)
  @POST('/payments/{id}/cancel')
  Future<CasePaymentEnvelope> cancelCasePayment({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Give money back to the client, fully or in part (attorney)
  @POST('/payments/{id}/refund')
  Future<CasePaymentEnvelope> refundCasePayment({
    @Path('id') required String id,
    @Body() required RefundCasePaymentDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
