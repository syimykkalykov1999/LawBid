// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_ops_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateOpsSettingsDto _$UpdateOpsSettingsDtoFromJson(
  Map<String, dynamic> json,
) => UpdateOpsSettingsDto(
  autoPauseHeavyJobs: json['autoPauseHeavyJobs'] as bool?,
  autoScaleDownOnBudget: json['autoScaleDownOnBudget'] as bool?,
);

Map<String, dynamic> _$UpdateOpsSettingsDtoToJson(
  UpdateOpsSettingsDto instance,
) => <String, dynamic>{
  'autoPauseHeavyJobs': ?instance.autoPauseHeavyJobs,
  'autoScaleDownOnBudget': ?instance.autoScaleDownOnBudget,
};
