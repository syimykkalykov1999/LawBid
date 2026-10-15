// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'analytics_retention_dto.g.dart';

@JsonSerializable()
class AnalyticsRetentionDto {
  const AnalyticsRetentionDto({
    required this.cohort,
    required this.d1Percent,
    required this.d7Percent,
  });

  factory AnalyticsRetentionDto.fromJson(Map<String, Object?> json) =>
      _$AnalyticsRetentionDtoFromJson(json);

  /// People who joined 7–14 days ago.
  final num cohort;

  /// Came back after day 1.
  final num d1Percent;

  /// Came back after day 7.
  final num d7Percent;

  Map<String, Object?> toJson() => _$AnalyticsRetentionDtoToJson(this);
}
