// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_rewards_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateRewardsSettingsDto _$UpdateRewardsSettingsDtoFromJson(
  Map<String, dynamic> json,
) => UpdateRewardsSettingsDto(
  enabled: json['enabled'] as bool?,
  autoAward: json['autoAward'] as bool?,
  period: json['period'] == null
      ? null
      : UpdateRewardsSettingsDtoPeriod.fromJson(json['period'] as String),
  departments: (json['departments'] as List<dynamic>?)
      ?.map(
        (e) => UpdateRewardDepartmentDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
);

Map<String, dynamic> _$UpdateRewardsSettingsDtoToJson(
  UpdateRewardsSettingsDto instance,
) => <String, dynamic>{
  'enabled': ?instance.enabled,
  'autoAward': ?instance.autoAward,
  'period': ?instance.period?.toJson(),
  'departments': ?instance.departments?.map((e) => e.toJson()).toList(),
};
