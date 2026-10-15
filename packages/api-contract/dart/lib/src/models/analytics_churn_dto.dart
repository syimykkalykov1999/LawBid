// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'analytics_churn_part_dto.dart';

part 'analytics_churn_dto.g.dart';

@JsonSerializable()
class AnalyticsChurnDto {
  const AnalyticsChurnDto({required this.clients, required this.attorneys});

  factory AnalyticsChurnDto.fromJson(Map<String, Object?> json) =>
      _$AnalyticsChurnDtoFromJson(json);

  final AnalyticsChurnPartDto clients;
  final AnalyticsChurnPartDto attorneys;

  Map<String, Object?> toJson() => _$AnalyticsChurnDtoToJson(this);
}
