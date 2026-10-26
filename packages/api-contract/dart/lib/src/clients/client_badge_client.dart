// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/client_badge_checkout_envelope.dart';
import '../models/client_badge_state_envelope.dart';
import '../models/submit_client_badge_dto.dart';

part 'client_badge_client.g.dart';

@RestApi()
abstract class ClientBadgeClient {
  factory ClientBadgeClient(Dio dio, {String? baseUrl}) = _ClientBadgeClient;

  /// My badge request, subscription and price
  @GET('/verification/client/me')
  Future<ClientBadgeStateEnvelope> getMyClientBadge({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Send documents for review (up to 5 files)
  @POST('/verification/client/submit')
  Future<ClientBadgeStateEnvelope> submitClientBadge({
    @Body() required SubmitClientBadgeDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Approved: the $10/month checkout page
  @POST('/verification/client/checkout')
  Future<ClientBadgeCheckoutEnvelope> startClientBadgeCheckout({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Stop renewing; the badge stays until the period ends
  @POST('/verification/client/cancel')
  Future<ClientBadgeStateEnvelope> cancelClientBadge({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Keep renewing after a cancel
  @POST('/verification/client/resume')
  Future<ClientBadgeStateEnvelope> resumeClientBadge({
    @Extras() Map<String, dynamic>? extras,
  });
}
