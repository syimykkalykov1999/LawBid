// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'update_reward_department_dto.dart';
import 'update_rewards_settings_dto_period.dart';

part 'update_rewards_settings_dto.g.dart';

@JsonSerializable()
class UpdateRewardsSettingsDto {
  const UpdateRewardsSettingsDto({
    this.enabled,
    this.autoAward,
    this.period,
    this.departments,
  });

  factory UpdateRewardsSettingsDto.fromJson(Map<String, Object?> json) =>
      _$UpdateRewardsSettingsDtoFromJson(json);

  final bool? enabled;
  final bool? autoAward;
  final UpdateRewardsSettingsDtoPeriod? period;
  final List<UpdateRewardDepartmentDto>? departments;

  Map<String, Object?> toJson() => _$UpdateRewardsSettingsDtoToJson(this);
}
