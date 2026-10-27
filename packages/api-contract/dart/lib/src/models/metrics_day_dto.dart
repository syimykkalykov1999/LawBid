// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'metrics_day_dto.g.dart';

@JsonSerializable()
class MetricsDayDto {
  const MetricsDayDto({
    required this.day,
    required this.actions,
    required this.appeals,
    required this.overturned,
  });

  factory MetricsDayDto.fromJson(Map<String, Object?> json) =>
      _$MetricsDayDtoFromJson(json);

  final String day;
  final int actions;
  final int appeals;
  final int overturned;

  Map<String, Object?> toJson() => _$MetricsDayDtoToJson(this);
}
