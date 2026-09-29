// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_me_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminMeDto _$AdminMeDtoFromJson(Map<String, dynamic> json) => AdminMeDto(
  id: json['id'] as String,
  email: json['email'] as String,
  role: AdminMeDtoRole.fromJson(json['role'] as String),
  totpEnabled: json['totpEnabled'] as bool,
  lastLoginAt: json['lastLoginAt'] == null
      ? null
      : DateTime.parse(json['lastLoginAt'] as String),
);

Map<String, dynamic> _$AdminMeDtoToJson(AdminMeDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'email': instance.email,
      'role': instance.role.toJson(),
      'totpEnabled': instance.totpEnabled,
      'lastLoginAt': ?instance.lastLoginAt?.toIso8601String(),
    };
