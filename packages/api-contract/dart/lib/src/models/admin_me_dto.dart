// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_me_dto_role.dart';
import 'permissions_permissions.dart';

part 'admin_me_dto.g.dart';

@JsonSerializable()
class AdminMeDto {
  const AdminMeDto({
    required this.id,
    required this.email,
    required this.role,
    required this.totpEnabled,
    required this.lastLoginAt,
    required this.login,
    required this.hasPassword,
    required this.permissions,
    required this.hasSecurityQuestion,
    required this.canManageAdmins,
    required this.securityQuestion,
  });

  factory AdminMeDto.fromJson(Map<String, Object?> json) =>
      _$AdminMeDtoFromJson(json);

  final String id;
  final String email;
  final AdminMeDtoRole role;
  final bool totpEnabled;
  final DateTime? lastLoginAt;

  /// Login, if set.
  final String? login;

  /// A password is set.
  final bool hasPassword;

  /// Area toggles (empty for the super admin, who reaches everything).
  final Map<String, PermissionsPermissions> permissions;

  /// Super admin: a security question is set.
  final bool hasSecurityQuestion;

  /// May create and manage other admins (the super admin always can).
  final bool canManageAdmins;
  final String? securityQuestion;

  Map<String, Object?> toJson() => _$AdminMeDtoToJson(this);
}
