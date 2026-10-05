// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reward_department_settings_dto.dart';
import 'rewards_settings_dto_period.dart';

part 'rewards_settings_dto.g.dart';

@JsonSerializable()
class RewardsSettingsDto {
  const RewardsSettingsDto({
    required this.enabled,
    required this.autoAward,
    required this.period,
    required this.departments,
  });

  factory RewardsSettingsDto.fromJson(Map<String, Object?> json) =>
      _$RewardsSettingsDtoFromJson(json);

  /// Master switch (owner). Off = nothing is shown anywhere.
  final bool enabled;

  /// Give the prizes at the end of every period automatically.
  final bool autoAward;
  final RewardsSettingsDtoPeriod period;
  final List<RewardDepartmentSettingsDto> departments;

  Map<String, Object?> toJson() => _$RewardsSettingsDtoToJson(this);
}
