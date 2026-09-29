// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_account_envelope.dart';
import '../models/admin_account_list_envelope.dart';
import '../models/create_admin_dto.dart';
import '../models/set_admin_role_dto.dart';

part 'admin_admins_client.g.dart';

@RestApi()
abstract class AdminAdminsClient {
  factory AdminAdminsClient(Dio dio, {String? baseUrl}) = _AdminAdminsClient;

  /// All administrator accounts
  @GET('/admin/admins')
  Future<AdminAccountListEnvelope> listAdmins({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Create an administrator (no self-registration)
  @POST('/admin/admins')
  Future<AdminAccountEnvelope> createAdmin({
    @Body() required CreateAdminDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Assign a role (ends the admin’s sessions)
  @PATCH('/admin/admins/{id}/role')
  Future<AdminAccountEnvelope> setAdminRole({
    @Path('id') required String id,
    @Body() required SetAdminRoleDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Disable an administrator (sessions revoked)
  @POST('/admin/admins/{id}/disable')
  Future<AdminAccountEnvelope> disableAdmin({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Re-enable a disabled administrator
  @POST('/admin/admins/{id}/enable')
  Future<AdminAccountEnvelope> enableAdmin({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Reset 2FA: the next sign-in binds a new authenticator
  @POST('/admin/admins/{id}/reset-2fa')
  Future<AdminAccountEnvelope> resetAdminTotp({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
