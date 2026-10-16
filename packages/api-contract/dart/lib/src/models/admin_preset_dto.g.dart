// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_preset_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPresetDto _$AdminPresetDtoFromJson(Map<String, dynamic> json) =>
    AdminPresetDto(
      key: json['key'] as String,
      label: json['label'] as String,
      description: json['description'] as String,
      role: AdminPresetDtoRole.fromJson(json['role'] as String),
      permissions: (json['permissions'] as Map<String, dynamic>).map(
        (k, e) => MapEntry(k, PermissionsPermissions.fromJson(e as String)),
      ),
      noPii: json['noPii'] as bool,
      dangerous: json['dangerous'] as bool,
    );

Map<String, dynamic> _$AdminPresetDtoToJson(
  AdminPresetDto instance,
) => <String, dynamic>{
  'key': instance.key,
  'label': instance.label,
  'description': instance.description,
  'role': instance.role.toJson(),
  'permissions': instance.permissions.map((k, e) => MapEntry(k, e.toJson())),
  'noPii': instance.noPii,
  'dangerous': instance.dangerous,
};
