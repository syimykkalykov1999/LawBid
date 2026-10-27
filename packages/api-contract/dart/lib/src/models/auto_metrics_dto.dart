// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'detection_metric_dto.dart';
import 'metrics_day_dto.dart';

part 'auto_metrics_dto.g.dart';

@JsonSerializable()
class AutoMetricsDto {
  const AutoMetricsDto({
    required this.days,
    required this.perDay,
    required this.autoActions,
    required this.shadowActions,
    required this.appeals,
    required this.decidedAppeals,
    required this.overturned,
    required this.pendingAppeals,
    required this.overdueAppeals,
    required this.priorityReviews,
    required this.appealRate,
    required this.overturnRate,
    required this.alarm,
    required this.alarmPercent,
    required this.detections,
  });

  factory AutoMetricsDto.fromJson(Map<String, Object?> json) =>
      _$AutoMetricsDtoFromJson(json);

  final int days;
  final List<MetricsDayDto> perDay;
  final int autoActions;
  final int shadowActions;
  final int appeals;
  final int decidedAppeals;
  final int overturned;
  final int pendingAppeals;
  final int overdueAppeals;
  final int priorityReviews;
  final num appealRate;
  final num overturnRate;

  /// Overturn rate is above the alarm level.
  final bool alarm;
  final num alarmPercent;
  final List<DetectionMetricDto> detections;

  Map<String, Object?> toJson() => _$AutoMetricsDtoToJson(this);
}
