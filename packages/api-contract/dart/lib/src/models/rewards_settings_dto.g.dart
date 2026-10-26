// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'rewards_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RewardsSettingsDto _$RewardsSettingsDtoFromJson(Map<String, dynamic> json) =>
    RewardsSettingsDto(
      enabled: json['enabled'] as bool,
      autoAward: json['autoAward'] as bool,
      period: RewardsSettingsDtoPeriod.fromJson(json['period'] as String),
      departments: (json['departments'] as List<dynamic>)
          .map(
            (e) =>
                RewardDepartmentSettingsDto.fromJson(e as Map<String, dynamic>),
          )
          .toList(),
    );

Map<String, dynamic> _$RewardsSettingsDtoToJson(RewardsSettingsDto instance) =>
    <String, dynamic>{
      'enabled': instance.enabled,
      'autoAward': instance.autoAward,
      'period': instance.period.toJson(),
      'departments': instance.departments.map((e) => e.toJson()).toList(),
    };
