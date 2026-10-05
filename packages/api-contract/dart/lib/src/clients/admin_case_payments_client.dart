// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_case_payment_row_envelope.dart';
import '../models/admin_case_payment_row_list_envelope.dart';
import '../models/admin_case_payment_stats_envelope.dart';
import '../models/admin_payment_settings_dto.dart';
import '../models/admin_payment_settings_view_envelope.dart';
import '../models/admin_payout_account_action_result_envelope.dart';
import '../models/admin_payout_account_row_list_envelope.dart';
import '../models/admin_refund_case_payment_dto.dart';
import '../models/case_payment_status.dart';
import '../models/payment_request_list_envelope.dart';
import '../models/payment_request_status.dart';
import '../models/payout_account_status.dart';

part 'admin_case_payments_client.g.dart';

@RestApi()
abstract class AdminCasePaymentsClient {
  factory AdminCasePaymentsClient(Dio dio, {String? baseUrl}) =
      _AdminCasePaymentsClient;

  /// Client → attorney payments, newest first.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [userId] - Client or attorney.
  ///
  /// [disputed] - Only disputed payments.
  @GET('/admin/case-payments')
  Future<AdminCasePaymentRowListEnvelope> listAdminCasePayments({
    @Query('cursor') String? cursor,
    @Query('status') CasePaymentStatus? status,
    @Query('userId') String? userId,
    @Query('caseId') String? caseId,
    @Query('from') DateTime? from,
    @Query('to') DateTime? to,
    @Query('disputed') bool? disputed,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Volume, platform fees, disputes, accounts
  @GET('/admin/case-payments/stats')
  Future<AdminCasePaymentStatsEnvelope> getAdminCasePaymentStats({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Fee rules for client → attorney payments
  @GET('/admin/case-payments/settings')
  Future<AdminPaymentSettingsViewEnvelope> getCasePaymentSettings({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Change the platform fee (type / amount / who pays) and limits (super admin)
  @PUT('/admin/case-payments/settings')
  Future<AdminPaymentSettingsViewEnvelope> updateCasePaymentSettings({
    @Body() required AdminPaymentSettingsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Payment requests (invoices) from attorneys.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [userId] - Client or attorney.
  @GET('/admin/case-payments/requests')
  Future<PaymentRequestListEnvelope> listRequests({
    @Query('cursor') String? cursor,
    @Query('status') PaymentRequestStatus? status,
    @Query('userId') String? userId,
    @Query('caseId') String? caseId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Attorneys' Stripe payout accounts.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/admin/case-payments/payout-accounts')
  Future<AdminPayoutAccountRowListEnvelope> listAdminPayoutAccounts({
    @Query('cursor') String? cursor,
    @Query('status') PayoutAccountStatus? status,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Re-read the account status from Stripe
  @POST('/admin/case-payments/payout-accounts/{userId}/sync')
  Future<AdminPayoutAccountActionResultEnvelope> syncAdminPayoutAccount({
    @Path('userId') required String userId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One payment with its refunds
  @GET('/admin/case-payments/{id}')
  Future<AdminCasePaymentRowEnvelope> getAdminCasePayment({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Refund the client on the attorney's behalf (full or partial)
  @POST('/admin/case-payments/{id}/refund')
  Future<AdminCasePaymentRowEnvelope> refundAdminCasePayment({
    @Path('id') required String id,
    @Body() required AdminRefundCasePaymentDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
