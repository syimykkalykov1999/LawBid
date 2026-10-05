// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ops_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OpsSettingsDto _$OpsSettingsDtoFromJson(Map<String, dynamic> json) =>
    OpsSettingsDto(
      autoPauseHeavyJobs: json['autoPauseHeavyJobs'] as bool,
      autoScaleDownOnBudget: json['autoScaleDownOnBudget'] as bool,
      dbSlowMs: json['dbSlowMs'] as num,
      backupMaxAgeHours: json['backupMaxAgeHours'] as num,
    );

Map<String, dynamic> _$OpsSettingsDtoToJson(OpsSettingsDto instance) =>
    <String, dynamic>{
      'autoPauseHeavyJobs': instance.autoPauseHeavyJobs,
      'autoScaleDownOnBudget': instance.autoScaleDownOnBudget,
      'dbSlowMs': instance.dbSlowMs,
      'backupMaxAgeHours': instance.backupMaxAgeHours,
    };
