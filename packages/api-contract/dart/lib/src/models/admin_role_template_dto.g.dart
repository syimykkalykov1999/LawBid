// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_role_template_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminRoleTemplateDto _$AdminRoleTemplateDtoFromJson(
  Map<String, dynamic> json,
) => AdminRoleTemplateDto(
  id: json['id'] as String,
  name: json['name'] as String,
  permissions: (json['permissions'] as Map<String, dynamic>).map(
    (k, e) => MapEntry(k, PermissionsPermissions.fromJson(e as String)),
  ),
  updatedAt: json['updatedAt'] as String,
);

Map<String, dynamic> _$AdminRoleTemplateDtoToJson(
  AdminRoleTemplateDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'permissions': instance.permissions.map((k, e) => MapEntry(k, e.toJson())),
  'updatedAt': instance.updatedAt,
};
