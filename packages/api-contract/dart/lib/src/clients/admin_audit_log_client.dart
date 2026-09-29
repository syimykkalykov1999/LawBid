// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/audit_log_entry_list_envelope.dart';

part 'admin_audit_log_client.g.dart';

@RestApi()
abstract class AdminAuditLogClient {
  factory AdminAuditLogClient(Dio dio, {String? baseUrl}) =
      _AdminAuditLogClient;

  /// Audit log, newest first (cursor).
  ///
  /// [adminId] - Administrator.
  ///
  /// [action] - Action prefix, e.g. `admin.login` or `verification.`.
  ///
  /// [targetType] - Object type, e.g. `verification_request`.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/admin/audit-log')
  Future<AuditLogEntryListEnvelope> listAuditLog({
    @Query('limit') int? limit = 50,
    @Query('adminId') String? adminId,
    @Query('action') String? action,
    @Query('targetType') String? targetType,
    @Query('targetId') String? targetId,
    @Query('from') DateTime? from,
    @Query('to') DateTime? to,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });
}
