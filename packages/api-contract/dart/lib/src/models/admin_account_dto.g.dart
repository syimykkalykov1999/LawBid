// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_account_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminAccountDto _$AdminAccountDtoFromJson(Map<String, dynamic> json) =>
    AdminAccountDto(
      id: json['id'] as String,
      email: json['email'] as String,
      role: AdminAccountDtoRole.fromJson(json['role'] as String),
      status: AdminAccountDtoStatus.fromJson(json['status'] as String),
      totpEnabled: json['totpEnabled'] as bool,
      login: json['login'] as String?,
      hasPassword: json['hasPassword'] as bool,
      permissions: (json['permissions'] as Map<String, dynamic>).map(
        (k, e) => MapEntry(k, PermissionsPermissions.fromJson(e as String)),
      ),
      canManageAdmins: json['canManageAdmins'] as bool,
      lastLoginAt: json['lastLoginAt'] == null
          ? null
          : DateTime.parse(json['lastLoginAt'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$AdminAccountDtoToJson(
  AdminAccountDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'email': instance.email,
  'role': instance.role.toJson(),
  'status': instance.status.toJson(),
  'totpEnabled': instance.totpEnabled,
  'login': ?instance.login,
  'hasPassword': instance.hasPassword,
  'permissions': instance.permissions.map((k, e) => MapEntry(k, e.toJson())),
  'canManageAdmins': instance.canManageAdmins,
  'lastLoginAt': ?instance.lastLoginAt?.toIso8601String(),
  'createdAt': instance.createdAt.toIso8601String(),
};
