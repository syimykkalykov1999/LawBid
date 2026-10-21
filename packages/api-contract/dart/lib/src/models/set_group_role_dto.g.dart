// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'set_group_role_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SetGroupRoleDto _$SetGroupRoleDtoFromJson(Map<String, dynamic> json) =>
    SetGroupRoleDto(
      role: SetGroupRoleDtoRole.fromJson(json['role'] as String),
      rights: (json['rights'] as List<dynamic>?)
          ?.map((e) => SetGroupRoleDtoRights.fromJson(e as String))
          .toList(),
    );

Map<String, dynamic> _$SetGroupRoleDtoToJson(SetGroupRoleDto instance) =>
    <String, dynamic>{
      'role': instance.role.toJson(),
      'rights': ?instance.rights?.map((e) => e.toJson()).toList(),
    };
