// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'set_admin_permissions_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SetAdminPermissionsDto _$SetAdminPermissionsDtoFromJson(
  Map<String, dynamic> json,
) => SetAdminPermissionsDto(
  permissions: (json['permissions'] as Map<String, dynamic>).map(
    (k, e) => MapEntry(k, PermissionsPermissions.fromJson(e as String)),
  ),
  canManageAdmins: json['canManageAdmins'] as bool?,
);

Map<String, dynamic> _$SetAdminPermissionsDtoToJson(
  SetAdminPermissionsDto instance,
) => <String, dynamic>{
  'permissions': instance.permissions.map((k, e) => MapEntry(k, e.toJson())),
  'canManageAdmins': ?instance.canManageAdmins,
};
