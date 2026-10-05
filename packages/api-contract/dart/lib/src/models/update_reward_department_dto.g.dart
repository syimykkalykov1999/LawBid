// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_reward_department_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateRewardDepartmentDto _$UpdateRewardDepartmentDtoFromJson(
  Map<String, dynamic> json,
) => UpdateRewardDepartmentDto(
  key: UpdateRewardDepartmentDtoKey.fromJson(json['key'] as String),
  enabled: json['enabled'] as bool?,
  prize: json['prize'] as String?,
  bonusCents: json['bonusCents'] as num?,
);

Map<String, dynamic> _$UpdateRewardDepartmentDtoToJson(
  UpdateRewardDepartmentDto instance,
) => <String, dynamic>{
  'key': instance.key.toJson(),
  'enabled': ?instance.enabled,
  'prize': ?instance.prize,
  'bonusCents': ?instance.bonusCents,
};
