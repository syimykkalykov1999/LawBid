// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'invite_admin_dto_role.dart';
import 'permissions_permissions.dart';

part 'invite_admin_dto.g.dart';

@JsonSerializable()
class InviteAdminDto {
  const InviteAdminDto({
    required this.email,
    this.preset,
    this.role,
    this.permissions,
    this.noPii,
  });

  factory InviteAdminDto.fromJson(Map<String, Object?> json) =>
      _$InviteAdminDtoFromJson(json);

  final String email;

  /// Preset key from GET /admin/admins/presets (owner, accountant, moderator, support, viewer).
  final String? preset;

  /// Default: the preset’s role.
  final InviteAdminDtoRole? role;

  /// Overrides the preset’s toggles (area → view | manage).
  final Map<String, PermissionsPermissions>? permissions;

  /// Overrides the preset’s «без персональных данных».
  final bool? noPii;

  Map<String, Object?> toJson() => _$InviteAdminDtoToJson(this);
}
