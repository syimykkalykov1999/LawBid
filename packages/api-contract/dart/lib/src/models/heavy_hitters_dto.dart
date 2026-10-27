// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'heavy_metric_dto.dart';

part 'heavy_hitters_dto.g.dart';

@JsonSerializable()
class HeavyHittersDto {
  const HeavyHittersDto({
    required this.enabled,
    required this.windowMinutes,
    required this.sampleEvery,
    required this.metrics,
  });

  factory HeavyHittersDto.fromJson(Map<String, Object?> json) =>
      _$HeavyHittersDtoFromJson(json);

  /// False when HEAVY_HITTERS_SAMPLE=0.
  final bool enabled;

  /// How far back the lists look, in minutes.
  final num windowMinutes;

  /// One request in N is counted (1 = all).
  final num sampleEvery;
  final List<HeavyMetricDto> metrics;

  Map<String, Object?> toJson() => _$HeavyHittersDtoToJson(this);
}
