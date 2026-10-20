// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/privacy_settings_envelope.dart';
import '../models/update_privacy_settings_dto.dart';

part 'privacy_client.g.dart';

@RestApi()
abstract class PrivacyClient {
  factory PrivacyClient(Dio dio, {String? baseUrl}) = _PrivacyClient;

  /// My privacy settings
  @GET('/users/me/privacy')
  Future<PrivacySettingsEnvelope> getPrivacySettings({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Change my privacy settings (any subset)
  @PUT('/users/me/privacy')
  Future<PrivacySettingsEnvelope> updatePrivacySettings({
    @Body() required UpdatePrivacySettingsDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
