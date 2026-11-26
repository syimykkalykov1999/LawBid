// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'settings_rollout_dto.g.dart';

@JsonSerializable()
class SettingsRolloutDto {
  const SettingsRolloutDto({
    required this.id,
    required this.adminId,
    required this.action,
    required this.keys,
    required this.before,
    required this.after,
    required this.startedAt,
    required this.watchUntil,
    required this.percent,
  });

  factory SettingsRolloutDto.fromJson(Map<String, Object?> json) =>
      _$SettingsRolloutDtoFromJson(json);

  final String id;
  final String adminId;

  /// Audit action of the save.
  final String action;
  final List<String> keys;

  /// Old values (null = default).
  final dynamic before;

  /// New values.
  final dynamic after;
  final DateTime startedAt;
  final DateTime watchUntil;

  /// Canary share of API tasks, %.
  final num percent;

  Map<String, Object?> toJson() => _$SettingsRolloutDtoToJson(this);
}
