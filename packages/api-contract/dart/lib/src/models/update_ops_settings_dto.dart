// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_ops_settings_dto.g.dart';

@JsonSerializable()
class UpdateOpsSettingsDto {
  const UpdateOpsSettingsDto({
    this.autoPauseHeavyJobs,
    this.autoScaleDownOnBudget,
  });

  factory UpdateOpsSettingsDto.fromJson(Map<String, Object?> json) =>
      _$UpdateOpsSettingsDtoFromJson(json);

  final bool? autoPauseHeavyJobs;
  final bool? autoScaleDownOnBudget;

  Map<String, Object?> toJson() => _$UpdateOpsSettingsDtoToJson(this);
}
