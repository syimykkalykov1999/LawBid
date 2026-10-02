// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'permissions_permissions.dart';

part 'set_admin_permissions_dto.g.dart';

@JsonSerializable()
class SetAdminPermissionsDto {
  const SetAdminPermissionsDto({
    required this.permissions,
    this.canManageAdmins,
  });

  factory SetAdminPermissionsDto.fromJson(Map<String, Object?> json) =>
      _$SetAdminPermissionsDtoFromJson(json);

  /// Area → "view" | "manage". Areas left out are closed. Applies at once.
  final Map<String, PermissionsPermissions> permissions;

  /// Super admin only: the right to create and manage other admins. Omitted = unchanged.
  final bool? canManageAdmins;

  Map<String, Object?> toJson() => _$SetAdminPermissionsDtoToJson(this);
}
