// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/own_attorney_profile_envelope.dart';
import '../models/public_attorney_profile_envelope.dart';
import '../models/replace_practice_areas_dto.dart';
import '../models/selected_practice_area_list_envelope.dart';
import '../models/update_attorney_profile_dto.dart';
import '../models/username_availability_envelope.dart';

part 'attorneys_client.g.dart';

@RestApi()
abstract class AttorneysClient {
  factory AttorneysClient(Dio dio, {String? baseUrl}) = _AttorneysClient;

  @GET('/attorneys/me/profile')
  Future<OwnAttorneyProfileEnvelope> getMyAttorneyProfile({
    @Extras() Map<String, dynamic>? extras,
  });

  @PATCH('/attorneys/me/profile')
  Future<OwnAttorneyProfileEnvelope> updateMyAttorneyProfile({
    @Body() required UpdateAttorneyProfileDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  @GET('/attorneys/me/practice-areas')
  Future<SelectedPracticeAreaListEnvelope> getMyPracticeAreas({
    @Extras() Map<String, dynamic>? extras,
  });

  @PUT('/attorneys/me/practice-areas')
  Future<SelectedPracticeAreaListEnvelope> replaceMyPracticeAreas({
    @Body() required ReplacePracticeAreasDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Rate-limited (§4.3): an enumeration aid otherwise.
  @GET('/attorneys/username-available')
  Future<UsernameAvailabilityEnvelope> checkUsernameAvailable({
    @Query('u') required String u,
    @Extras() Map<String, dynamic>? extras,
  });

  @GET('/attorneys/{username}')
  Future<PublicAttorneyProfileEnvelope> getAttorneyProfile({
    @Path('username') required String username,
    @Extras() Map<String, dynamic>? extras,
  });
}
