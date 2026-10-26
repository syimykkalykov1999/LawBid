// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_ok_envelope.dart';
import '../models/admin_session_row_list_envelope.dart';

part 'admin_sessions_client.g.dart';

@RestApi()
abstract class AdminSessionsClient {
  factory AdminSessionsClient(Dio dio, {String? baseUrl}) =
      _AdminSessionsClient;

  /// Live admin sessions: who, since when, where from, last action
  @GET('/admin/sessions')
  Future<AdminSessionRowListEnvelope> listAdminSessions({
    @Extras() Map<String, dynamic>? extras,
  });

  /// End one admin session at once
  @POST('/admin/sessions/{sessionId}/revoke')
  Future<AdminOkEnvelope> revokeAdminSession({
    @Path('sessionId') required String sessionId,
    @Extras() Map<String, dynamic>? extras,
  });
}
