// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'create_admin_dto_role.dart';
import 'permissions_permissions.dart';

part 'create_admin_dto.g.dart';

@JsonSerializable()
class CreateAdminDto {
  const CreateAdminDto({
    required this.email,
    required this.role,
    this.permissions,
    this.canManageAdmins,
  });

  factory CreateAdminDto.fromJson(Map<String, Object?> json) =>
      _$CreateAdminDtoFromJson(json);

  final String email;
  final CreateAdminDtoRole role;

  /// Starting toggles; omitted = the defaults of the role. Money, keys and admin sections are never grantable.
  final Map<String, PermissionsPermissions>? permissions;

  /// Super admin only: lets this admin create and manage other admins within their own access.
  final bool? canManageAdmins;

  Map<String, Object?> toJson() => _$CreateAdminDtoToJson(this);
}
