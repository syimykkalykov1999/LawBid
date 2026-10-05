// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_billing_reason_dto.dart';
import '../models/admin_cancel_subscription_dto.dart';
import '../models/admin_subscription_action_result_envelope.dart';
import '../models/admin_subscription_envelope.dart';
import '../models/extend_subscription_dto.dart';

part 'admin_subscriptions_client.g.dart';

@RestApi()
abstract class AdminSubscriptionsClient {
  factory AdminSubscriptionsClient(Dio dio, {String? baseUrl}) =
      _AdminSubscriptionsClient;

  /// An attorney's subscription, payments and the Stripe link
  @GET('/admin/subscriptions/{userId}')
  Future<AdminSubscriptionEnvelope> getAdminSubscription({
    @Path('userId') required String userId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Extend by N days (compensation), reason required
  @POST('/admin/subscriptions/{userId}/extend')
  Future<AdminSubscriptionEnvelope> extendSubscription({
    @Path('userId') required String userId,
    @Body() required ExtendSubscriptionDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Cancel at period end or now (optional prorated / full refund); reason audited, attorney notified
  @POST('/admin/subscriptions/{userId}/cancel')
  Future<AdminSubscriptionActionResultEnvelope> cancelAdminSubscription({
    @Path('userId') required String userId,
    @Body() required AdminCancelSubscriptionDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Undo a pending cancel at period end
  @POST('/admin/subscriptions/{userId}/resume')
  Future<AdminSubscriptionActionResultEnvelope> resumeAdminSubscription({
    @Path('userId') required String userId,
    @Body() required AdminBillingReasonDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
