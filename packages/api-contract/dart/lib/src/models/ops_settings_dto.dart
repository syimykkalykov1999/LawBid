// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'ops_settings_dto.g.dart';

@JsonSerializable()
class OpsSettingsDto {
  const OpsSettingsDto({
    required this.autoPauseHeavyJobs,
    required this.autoScaleDownOnBudget,
    required this.dbSlowMs,
    required this.backupMaxAgeHours,
  });

  factory OpsSettingsDto.fromJson(Map<String, Object?> json) =>
      _$OpsSettingsDtoFromJson(json);

  final bool autoPauseHeavyJobs;
  final bool autoScaleDownOnBudget;
  final num dbSlowMs;
  final num backupMaxAgeHours;

  Map<String, Object?> toJson() => _$OpsSettingsDtoToJson(this);
}
