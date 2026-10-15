// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'analytics_churn_dto.dart';
import 'analytics_day_dto.dart';
import 'analytics_retention_dto.dart';
import 'analytics_step_dto.dart';

part 'analytics_dto.g.dart';

@JsonSerializable()
class AnalyticsDto {
  const AnalyticsDto({
    required this.days,
    required this.dau,
    required this.wau,
    required this.mau,
    required this.stickinessPercent,
    required this.funnel,
    required this.retention,
    required this.churn,
    required this.daily,
  });

  factory AnalyticsDto.fromJson(Map<String, Object?> json) =>
      _$AnalyticsDtoFromJson(json);

  final num days;
  final num dau;
  final num wau;
  final num mau;

  /// DAU as a share of MAU, in percent.
  final num stickinessPercent;
  final List<AnalyticsStepDto> funnel;
  final AnalyticsRetentionDto retention;
  final AnalyticsChurnDto churn;
  final List<AnalyticsDayDto> daily;

  Map<String, Object?> toJson() => _$AnalyticsDtoToJson(this);
}
