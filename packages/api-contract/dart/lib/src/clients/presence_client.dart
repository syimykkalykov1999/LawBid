// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/activity_status_dto.dart';
import '../models/activity_status_envelope.dart';

part 'presence_client.g.dart';

@RestApi()
abstract class PresenceClient {
  factory PresenceClient(Dio dio, {String? baseUrl}) = _PresenceClient;

  /// My activity-status setting
  @GET('/users/me/activity-status')
  Future<ActivityStatusEnvelope> getActivityStatus({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Show / hide my activity status
  @PUT('/users/me/activity-status')
  Future<ActivityStatusEnvelope> setActivityStatus({
    @Body() required ActivityStatusDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
