// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_preset_dto_role.dart';
import 'permissions_permissions.dart';

part 'admin_preset_dto.g.dart';

@JsonSerializable()
class AdminPresetDto {
  const AdminPresetDto({
    required this.key,
    required this.label,
    required this.description,
    required this.role,
    required this.permissions,
    required this.noPii,
    required this.dangerous,
  });

  factory AdminPresetDto.fromJson(Map<String, Object?> json) =>
      _$AdminPresetDtoFromJson(json);

  final String key;
  final String label;
  final String description;
  final AdminPresetDtoRole role;
  final Map<String, PermissionsPermissions> permissions;

  /// Personal data is masked.
  final bool noPii;

  /// Creates another owner.
  final bool dangerous;

  Map<String, Object?> toJson() => _$AdminPresetDtoToJson(this);
}
