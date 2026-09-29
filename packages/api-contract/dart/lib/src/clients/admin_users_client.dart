// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_user_card_envelope.dart';
import '../models/admin_user_contacts_envelope.dart';
import '../models/admin_user_list_item_list_envelope.dart';
import '../models/role.dart';
import '../models/sanction_result_envelope.dart';
import '../models/status.dart';
import '../models/suspend_user_dto.dart';
import '../models/warn_user_dto.dart';

part 'admin_users_client.g.dart';

@RestApi()
abstract class AdminUsersClient {
  factory AdminUsersClient(Dio dio, {String? baseUrl}) = _AdminUsersClient;

  /// Search users (name, email, phone, @username, id).
  ///
  /// [q] - Name (substring), email, phone (any format), @username or user id. Empty = newest users.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/admin/users')
  Future<AdminUserListItemListEnvelope> searchUsers({
    @Query('limit') int? limit = 20,
    @Query('q') String? q,
    @Query('role') Role? role,
    @Query('status') Status? status,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// User card (no contacts)
  @GET('/admin/users/{id}')
  Future<AdminUserCardEnvelope> getUserCard({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Email / phone — requires X-Justification (audited).
  ///
  /// [xJustification] - Why the data is being viewed (10–500 characters).
  @GET('/admin/users/{id}/contacts')
  Future<AdminUserContactsEnvelope> getUserContacts({
    @Path('id') required String id,
    @Header('X-Justification') required String xJustification,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Revoke every session of the user
  @POST('/admin/users/{id}/sessions/revoke')
  Future<SanctionResultEnvelope> revokeUserSessions({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Warn (moderation_notice)
  @POST('/admin/users/{id}/warn')
  Future<SanctionResultEnvelope> warnUser({
    @Path('id') required String id,
    @Body() required WarnUserDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Suspend (§3.4): sessions revoked; client open cases archived; attorney profile suspended
  @POST('/admin/users/{id}/suspend')
  Future<SanctionResultEnvelope> suspendUser({
    @Path('id') required String id,
    @Body() required SuspendUserDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Restore a suspended account
  @POST('/admin/users/{id}/restore')
  Future<SanctionResultEnvelope> restoreUser({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
