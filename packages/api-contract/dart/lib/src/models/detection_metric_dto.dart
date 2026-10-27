// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'detection_metric_dto.g.dart';

@JsonSerializable()
class DetectionMetricDto {
  const DetectionMetricDto({
    required this.mode,
    required this.count,
    required this.acted,
  });

  factory DetectionMetricDto.fromJson(Map<String, Object?> json) =>
      _$DetectionMetricDtoFromJson(json);

  final String mode;
  final int count;
  final int acted;

  Map<String, Object?> toJson() => _$DetectionMetricDtoToJson(this);
}
