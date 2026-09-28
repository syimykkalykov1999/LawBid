// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/client_profile_envelope.dart';
import '../models/update_client_profile_dto.dart';
import '../models/update_contact_preferences_dto.dart';

part 'profiles_client.g.dart';

@RestApi()
abstract class ProfilesClient {
  factory ProfilesClient(Dio dio, {String? baseUrl}) = _ProfilesClient;

  @GET('/users/me/profile')
  Future<ClientProfileEnvelope> getMyClientProfile({
    @Extras() Map<String, dynamic>? extras,
  });

  @PATCH('/users/me/profile')
  Future<ClientProfileEnvelope> updateMyClientProfile({
    @Body() required UpdateClientProfileDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  @PATCH('/users/me/contact-preferences')
  Future<ClientProfileEnvelope> updateMyContactPreferences({
    @Body() required UpdateContactPreferencesDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
