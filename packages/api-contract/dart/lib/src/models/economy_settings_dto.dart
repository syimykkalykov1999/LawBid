// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'economy_settings_dto_ceiling_mode.dart';

part 'economy_settings_dto.g.dart';

@JsonSerializable()
class EconomySettingsDto {
  const EconomySettingsDto({
    required this.percent,
    required this.thresholdUsd,
    required this.ceilingMode,
    required this.manualApi,
    required this.manualWorker,
    required this.awsFallbackUsd,
    required this.dailyBrakeDays,
    required this.ceilingUpWindowMin,
    required this.ceilingDownWindowMin,
    required this.ceilingTolerancePercent,
  });

  factory EconomySettingsDto.fromJson(Map<String, Object?> json) =>
      _$EconomySettingsDtoFromJson(json);

  /// Third-party spend ≤ this % of 30-day revenue.
  final num percent;

  /// …but never below this many USD a month.
  final num thresholdUsd;
  final EconomySettingsDtoCeilingMode ceilingMode;
  final num manualApi;
  final num manualWorker;
  final num awsFallbackUsd;

  /// The daily money brake = allowed spend / 30 × this many days.
  final num dailyBrakeDays;

  /// Auto ceiling: no increase unless every recommendation of the last N minutes agrees (HPA scale-up stabilization window).
  final num ceilingUpWindowMin;

  /// Auto ceiling: no decrease unless every recommendation of the last N minutes agrees (HPA scale-down stabilization window).
  final num ceilingDownWindowMin;

  /// Auto ceiling: a recommendation within this percent of the current ceiling changes nothing (HPA tolerance).
  final num ceilingTolerancePercent;

  Map<String, Object?> toJson() => _$EconomySettingsDtoToJson(this);
}
