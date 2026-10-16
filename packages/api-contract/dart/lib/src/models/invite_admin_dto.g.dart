// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'invite_admin_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InviteAdminDto _$InviteAdminDtoFromJson(Map<String, dynamic> json) =>
    InviteAdminDto(
      email: json['email'] as String,
      preset: json['preset'] as String?,
      role: json['role'] == null
          ? null
          : InviteAdminDtoRole.fromJson(json['role'] as String),
      permissions: (json['permissions'] as Map<String, dynamic>?)?.map(
        (k, e) => MapEntry(k, PermissionsPermissions.fromJson(e as String)),
      ),
      noPii: json['noPii'] as bool?,
    );

Map<String, dynamic> _$InviteAdminDtoToJson(
  InviteAdminDto instance,
) => <String, dynamic>{
  'email': instance.email,
  'preset': ?instance.preset,
  'role': ?instance.role?.toJson(),
  'permissions': ?instance.permissions?.map((k, e) => MapEntry(k, e.toJson())),
  'noPii': ?instance.noPii,
};
