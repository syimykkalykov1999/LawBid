// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'analytics_step_dto_key.dart';

part 'analytics_step_dto.g.dart';

@JsonSerializable()
class AnalyticsStepDto {
  const AnalyticsStepDto({required this.key, required this.count});

  factory AnalyticsStepDto.fromJson(Map<String, Object?> json) =>
      _$AnalyticsStepDtoFromJson(json);

  final AnalyticsStepDtoKey key;
  final num count;

  Map<String, Object?> toJson() => _$AnalyticsStepDtoToJson(this);
}
