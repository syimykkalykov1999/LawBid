// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'permissions_permissions.dart';

part 'save_admin_role_template_dto.g.dart';

@JsonSerializable()
class SaveAdminRoleTemplateDto {
  const SaveAdminRoleTemplateDto({
    required this.name,
    required this.permissions,
  });

  factory SaveAdminRoleTemplateDto.fromJson(Map<String, Object?> json) =>
      _$SaveAdminRoleTemplateDtoFromJson(json);

  final String name;
  final Map<String, PermissionsPermissions> permissions;

  Map<String, Object?> toJson() => _$SaveAdminRoleTemplateDtoToJson(this);
}
