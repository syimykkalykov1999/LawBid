// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_account_envelope.dart';
import '../models/admin_account_list_envelope.dart';
import '../models/admin_role_template_envelope.dart';
import '../models/admin_role_template_list_envelope.dart';
import '../models/create_admin_dto.dart';
import '../models/save_admin_role_template_dto.dart';
import '../models/set_admin_credentials_dto.dart';
import '../models/set_admin_permissions_dto.dart';
import '../models/set_admin_role_dto.dart';

part 'admin_admins_client.g.dart';

@RestApi()
abstract class AdminAdminsClient {
  factory AdminAdminsClient(Dio dio, {String? baseUrl}) = _AdminAdminsClient;

  /// Saved rights templates
  @GET('/admin/admins/templates')
  Future<AdminRoleTemplateListEnvelope> listTemplates({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Save a named set of rights
  @POST('/admin/admins/templates')
  Future<AdminRoleTemplateEnvelope> createTemplate({
    @Body() required SaveAdminRoleTemplateDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Rename or change a template
  @PATCH('/admin/admins/templates/{id}')
  Future<AdminRoleTemplateEnvelope> updateTemplate({
    @Path('id') required String id,
    @Body() required SaveAdminRoleTemplateDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete a template (admins keep their rights)
  @DELETE('/admin/admins/templates/{id}')
  Future<void> deleteTemplate({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

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

  /// Toggle areas for an admin (view / manage), within what the caller holds. Money and keys cannot be granted.
  @PATCH('/admin/admins/{id}/permissions')
  Future<AdminAccountEnvelope> setAdminPermissions({
    @Path('id') required String id,
    @Body() required SetAdminPermissionsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Set an admin’s login and/or password (needs a fresh step-up; their sessions end)
  @PUT('/admin/admins/{id}/credentials')
  Future<AdminAccountEnvelope> setAdminCredentials({
    @Path('id') required String id,
    @Body() required SetAdminCredentialsDto body,
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

  /// Remove an administrator: account closed, login and password wiped, sessions revoked
  @DELETE('/admin/admins/{id}')
  Future<void> removeAdmin({
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
