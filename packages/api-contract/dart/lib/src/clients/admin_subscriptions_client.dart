// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

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
}
