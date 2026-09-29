// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/confirm_subscription_dto.dart';
import '../models/payment_list_envelope.dart';
import '../models/portal_session_envelope.dart';
import '../models/start_subscription_result_envelope.dart';
import '../models/subscription_me_envelope.dart';

part 'subscriptions_client.g.dart';

@RestApi()
abstract class SubscriptionsClient {
  factory SubscriptionsClient(Dio dio, {String? baseUrl}) =
      _SubscriptionsClient;

  /// Customer + SetupIntent for the PaymentSheet; trial eligibility
  @POST('/subscriptions/start')
  Future<StartSubscriptionResultEnvelope> startSubscription({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Card confirmed → create the subscription (7-day trial when eligible)
  @POST('/subscriptions/confirm')
  Future<SubscriptionMeEnvelope> confirmSubscription({
    @Body() required ConfirmSubscriptionDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Current subscription and access verdict
  @GET('/subscriptions/me')
  Future<SubscriptionMeEnvelope> mySubscription({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Payment history (cursor).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/subscriptions/payments')
  Future<PaymentListEnvelope> myPayments({
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Stripe Customer Portal URL (card, invoices, cancel)
  @POST('/subscriptions/portal-session')
  Future<PortalSessionEnvelope> portalSession({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Cancel at period end (access stays until then)
  @POST('/subscriptions/cancel')
  Future<SubscriptionMeEnvelope> cancelSubscription({
    @Extras() Map<String, dynamic>? extras,
  });
}
