// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'heavy_entry_dto.dart';
import 'heavy_metric_dto_metric.dart';

part 'heavy_metric_dto.g.dart';

@JsonSerializable()
class HeavyMetricDto {
  const HeavyMetricDto({
    required this.metric,
    required this.users,
    required this.cases,
  });

  factory HeavyMetricDto.fromJson(Map<String, Object?> json) =>
      _$HeavyMetricDtoFromJson(json);

  final HeavyMetricDtoMetric metric;
  final List<HeavyEntryDto> users;
  final List<HeavyEntryDto> cases;

  Map<String, Object?> toJson() => _$HeavyMetricDtoToJson(this);
}
