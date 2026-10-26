// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/username_check_envelope.dart';
import '../models/username_kind.dart';

part 'usernames_client.g.dart';

@RestApi()
abstract class UsernamesClient {
  factory UsernamesClient(Dio dio, {String? baseUrl}) = _UsernamesClient;

  /// Rate-limited: an enumeration aid otherwise.
  ///
  /// [u] - The handle as typed, with or without @.
  ///
  /// [title] - The title typed on the form (ideas for suggestions).
  ///
  /// [id] - The channel or group being renamed: its own handle is available.
  @GET('/usernames/check')
  Future<UsernameCheckEnvelope> check({
    @Query('u') required String u,
    @Query('kind') required UsernameKind kind,
    @Query('title') String? title,
    @Query('id') String? id,
    @Extras() Map<String, dynamic>? extras,
  });
}
