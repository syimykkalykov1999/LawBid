// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_billing_reason_dto.dart';
import '../models/admin_billing_subscription_row_list_envelope.dart';
import '../models/admin_payment_list_envelope.dart';
import '../models/billing_overview_envelope.dart';
import '../models/contract_grant_envelope.dart';
import '../models/contract_grant_list_envelope.dart';
import '../models/contract_grant_status.dart';
import '../models/create_contract_grant_dto.dart';
import '../models/create_promo_code_dto.dart';
import '../models/create_refund_dto.dart';
import '../models/extend_contract_grant_dto.dart';
import '../models/payment_status.dart';
import '../models/plan.dart';
import '../models/promo_code_envelope.dart';
import '../models/promo_code_filter.dart';
import '../models/promo_code_list_envelope.dart';
import '../models/promo_redemption_list_envelope.dart';
import '../models/refund_envelope.dart';
import '../models/refund_list_envelope.dart';
import '../models/seats.dart';
import '../models/status6.dart';
import '../models/update_promo_code_dto.dart';

part 'admin_billing_client.g.dart';

@RestApi()
abstract class AdminBillingClient {
  factory AdminBillingClient(Dio dio, {String? baseUrl}) = _AdminBillingClient;

  /// MRR, subscription counts, grants, 30-day revenue and refunds
  @GET('/admin/billing/overview')
  Future<BillingOverviewEnvelope> getBillingOverview({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Subscriptions with user, seats and grant (cursor).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [q] - Name or email.
  ///
  /// [hasContractGrant] - Only with / without an active grant.
  ///
  /// [trialEndsWithinDays] - Trial ends within N days (trialing only).
  ///
  /// [seats] - Paid assistant seats: none (0), some (1-5), full (6).
  ///
  /// [cancelAtPeriodEnd] - Only (not) set to cancel at period end.
  ///
  /// [renewsWithinDays] - Current period ends within N days.
  ///
  /// [hadTrial] - Has (not) ever had a trial.
  @GET('/admin/billing/subscriptions')
  Future<AdminBillingSubscriptionRowListEnvelope> listBillingSubscriptions({
    @Query('cursor') String? cursor,
    @Query('status') Status6? status,
    @Query('plan') Plan? plan,
    @Query('q') String? q,
    @Query('hasContractGrant') bool? hasContractGrant,
    @Query('trialEndsWithinDays') num? trialEndsWithinDays,
    @Query('seats') Seats? seats,
    @Query('cancelAtPeriodEnd') bool? cancelAtPeriodEnd,
    @Query('renewsWithinDays') num? renewsWithinDays,
    @Query('hadTrial') bool? hadTrial,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Contract (free) subscriptions, newest first.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/admin/billing/contract-grants')
  Future<ContractGrantListEnvelope> listContractGrants({
    @Query('cursor') String? cursor,
    @Query('status') ContractGrantStatus? status,
    @Query('userId') String? userId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Give an attorney a free subscription for 3–12 months
  @POST('/admin/billing/contract-grants')
  Future<ContractGrantEnvelope> createContractGrant({
    @Body() required CreateContractGrantDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// An attorney's contract grants (all, newest first)
  @GET('/admin/billing/contract-grants/users/{userId}')
  Future<ContractGrantListEnvelope> getUserContractGrants({
    @Path('userId') required String userId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add months to a grant (24 months at most)
  @POST('/admin/billing/contract-grants/{id}/extend')
  Future<ContractGrantEnvelope> extendContractGrant({
    @Path('id') required String id,
    @Body() required ExtendContractGrantDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Revoke a grant now (reason ≥ 10 chars)
  @POST('/admin/billing/contract-grants/{id}/revoke')
  Future<ContractGrantEnvelope> revokeContractGrant({
    @Path('id') required String id,
    @Body() required AdminBillingReasonDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Promo codes, newest first.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [q] - Code prefix.
  @GET('/admin/billing/promo-codes')
  Future<PromoCodeListEnvelope> listPromoCodes({
    @Query('cursor') String? cursor,
    @Query('status') PromoCodeFilter? status,
    @Query('q') String? q,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Create a promo code (+ a Stripe coupon when configured)
  @POST('/admin/billing/promo-codes')
  Future<PromoCodeEnvelope> createPromoCode({
    @Body() required CreatePromoCodeDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Edit description, active, max redemptions, expiry
  @PATCH('/admin/billing/promo-codes/{id}')
  Future<PromoCodeEnvelope> updatePromoCode({
    @Path('id') required String id,
    @Body() required UpdatePromoCodeDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Switch a promo code off
  @POST('/admin/billing/promo-codes/{id}/deactivate')
  Future<PromoCodeEnvelope> deactivatePromoCode({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Who used a promo code (cursor).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/admin/billing/promo-codes/{id}/redemptions')
  Future<PromoRedemptionListEnvelope> listPromoRedemptions({
    @Path('id') required String id,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Payments with refunded amounts (cursor).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [from] - created_at ≥.
  ///
  /// [to] - created_at <.
  @GET('/admin/billing/payments')
  Future<AdminPaymentListEnvelope> listBillingPayments({
    @Query('cursor') String? cursor,
    @Query('status') PaymentStatus? status,
    @Query('userId') String? userId,
    @Query('from') DateTime? from,
    @Query('to') DateTime? to,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Refunds, newest first (cursor).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/admin/billing/refunds')
  Future<RefundListEnvelope> listBillingRefunds({
    @Query('cursor') String? cursor,
    @Query('paymentId') String? paymentId,
    @Query('userId') String? userId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Refund part or all of a payment (reason ≥ 10 chars)
  @POST('/admin/billing/refunds')
  Future<RefundEnvelope> createRefund({
    @Body() required CreateRefundDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
