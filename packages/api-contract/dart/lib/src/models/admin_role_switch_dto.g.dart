// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_role_switch_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminRoleSwitchDto _$AdminRoleSwitchDtoFromJson(Map<String, dynamic> json) =>
    AdminRoleSwitchDto(
      from: json['from'] as String,
      to: json['to'] as String,
      reverted: json['reverted'] as bool,
      ip: json['ip'] as String?,
      at: DateTime.parse(json['at'] as String),
    );

Map<String, dynamic> _$AdminRoleSwitchDtoToJson(AdminRoleSwitchDto instance) =>
    <String, dynamic>{
      'from': instance.from,
      'to': instance.to,
      'reverted': instance.reverted,
      'ip': ?instance.ip,
      'at': instance.at.toIso8601String(),
    };
