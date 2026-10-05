// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reward_department_settings_dto_key.dart';

part 'reward_department_settings_dto.g.dart';

@JsonSerializable()
class RewardDepartmentSettingsDto {
  const RewardDepartmentSettingsDto({
    required this.key,
    required this.label,
    required this.enabled,
    required this.prize,
    required this.bonusCents,
  });

  factory RewardDepartmentSettingsDto.fromJson(Map<String, Object?> json) =>
      _$RewardDepartmentSettingsDtoFromJson(json);

  final RewardDepartmentSettingsDtoKey key;
  final String label;

  /// Take part in «Лучший сотрудник».
  final bool enabled;

  /// The prize text, e.g. «Выходной день».
  final String prize;

  /// Bonus in cents, paid with the next salary (0 = none).
  final num bonusCents;

  Map<String, Object?> toJson() => _$RewardDepartmentSettingsDtoToJson(this);
}
