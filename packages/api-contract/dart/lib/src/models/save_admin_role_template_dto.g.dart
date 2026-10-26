// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'save_admin_role_template_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SaveAdminRoleTemplateDto _$SaveAdminRoleTemplateDtoFromJson(
  Map<String, dynamic> json,
) => SaveAdminRoleTemplateDto(
  name: json['name'] as String,
  permissions: (json['permissions'] as Map<String, dynamic>).map(
    (k, e) => MapEntry(k, PermissionsPermissions.fromJson(e as String)),
  ),
);

Map<String, dynamic> _$SaveAdminRoleTemplateDtoToJson(
  SaveAdminRoleTemplateDto instance,
) => <String, dynamic>{
  'name': instance.name,
  'permissions': instance.permissions.map((k, e) => MapEntry(k, e.toJson())),
};
