// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/public_attorney_list_envelope.dart';

part 'public_client.g.dart';

@RestApi()
abstract class PublicClient {
  factory PublicClient(Dio dio, {String? baseUrl}) = _PublicClient;

  /// [state] - State of a verified license.
  ///
  /// [practice] - Practice area code (a category covers its specializations).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/public/directory/attorneys')
  Future<PublicAttorneyListEnvelope> listPublicAttorneys({
    @Query('limit') num? limit = 50,
    @Query('state') String? state,
    @Query('practice') String? practice,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });
}
