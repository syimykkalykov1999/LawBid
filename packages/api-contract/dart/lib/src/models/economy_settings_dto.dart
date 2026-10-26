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
    required this.smsUnitUsd,
    required this.videoUnitUsd,
    required this.translateUnitUsd,
    required this.awsFallbackUsd,
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
  final num smsUnitUsd;
  final num videoUnitUsd;
  final num translateUnitUsd;
  final num awsFallbackUsd;

  Map<String, Object?> toJson() => _$EconomySettingsDtoToJson(this);
}
