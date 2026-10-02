// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_admin_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateAdminDto _$CreateAdminDtoFromJson(Map<String, dynamic> json) =>
    CreateAdminDto(
      email: json['email'] as String,
      role: CreateAdminDtoRole.fromJson(json['role'] as String),
      permissions: (json['permissions'] as Map<String, dynamic>?)?.map(
        (k, e) => MapEntry(k, PermissionsPermissions.fromJson(e as String)),
      ),
      canManageAdmins: json['canManageAdmins'] as bool?,
    );

Map<String, dynamic> _$CreateAdminDtoToJson(
  CreateAdminDto instance,
) => <String, dynamic>{
  'email': instance.email,
  'role': instance.role.toJson(),
  'permissions': ?instance.permissions?.map((k, e) => MapEntry(k, e.toJson())),
  'canManageAdmins': ?instance.canManageAdmins,
};
