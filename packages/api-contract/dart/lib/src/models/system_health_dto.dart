// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'health_item_dto.dart';
import 'heavy_pause_dto.dart';
import 'ops_actions_dto.dart';
import 'ops_settings_dto.dart';
import 'scale_mode_dto.dart';
import 'system_health_dto_overall.dart';

part 'system_health_dto.g.dart';

@JsonSerializable()
class SystemHealthDto {
  const SystemHealthDto({
    required this.overall,
    required this.generatedAt,
    required this.items,
    required this.actions,
    required this.settings,
    this.heavyPause,
    this.scaleMode,
  });

  factory SystemHealthDto.fromJson(Map<String, Object?> json) =>
      _$SystemHealthDtoFromJson(json);

  final SystemHealthDtoOverall overall;
  final String generatedAt;
  final List<HealthItemDto> items;
  final HeavyPauseDto? heavyPause;
  final ScaleModeDto? scaleMode;
  final OpsActionsDto actions;
  final OpsSettingsDto settings;

  Map<String, Object?> toJson() => _$SystemHealthDtoToJson(this);
}
