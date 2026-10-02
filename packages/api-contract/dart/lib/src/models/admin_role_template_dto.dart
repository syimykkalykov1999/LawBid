// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'permissions_permissions.dart';

part 'admin_role_template_dto.g.dart';

@JsonSerializable()
class AdminRoleTemplateDto {
  const AdminRoleTemplateDto({
    required this.id,
    required this.name,
    required this.permissions,
    required this.updatedAt,
  });

  factory AdminRoleTemplateDto.fromJson(Map<String, Object?> json) =>
      _$AdminRoleTemplateDtoFromJson(json);

  final String id;
  final String name;
  final Map<String, PermissionsPermissions> permissions;
  final String updatedAt;

  Map<String, Object?> toJson() => _$AdminRoleTemplateDtoToJson(this);
}
