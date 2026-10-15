// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'analytics_churn_part_dto.g.dart';

@JsonSerializable()
class AnalyticsChurnPartDto {
  const AnalyticsChurnPartDto({required this.before, required this.lost});

  factory AnalyticsChurnPartDto.fromJson(Map<String, Object?> json) =>
      _$AnalyticsChurnPartDtoFromJson(json);

  /// Active 30–60 days ago.
  final num before;

  /// Of them, not seen in the last 30 days.
  final num lost;

  Map<String, Object?> toJson() => _$AnalyticsChurnPartDtoToJson(this);
}
