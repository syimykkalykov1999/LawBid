// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reward_department_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RewardDepartmentSettingsDto _$RewardDepartmentSettingsDtoFromJson(
  Map<String, dynamic> json,
) => RewardDepartmentSettingsDto(
  key: RewardDepartmentSettingsDtoKey.fromJson(json['key'] as String),
  label: json['label'] as String,
  enabled: json['enabled'] as bool,
  prize: json['prize'] as String,
  bonusCents: json['bonusCents'] as num,
);

Map<String, dynamic> _$RewardDepartmentSettingsDtoToJson(
  RewardDepartmentSettingsDto instance,
) => <String, dynamic>{
  'key': instance.key.toJson(),
  'label': instance.label,
  'enabled': instance.enabled,
  'prize': instance.prize,
  'bonusCents': instance.bonusCents,
};
