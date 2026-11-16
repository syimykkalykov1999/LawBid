// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'autoscale_tuning_target_dto.dart';

part 'autoscale_tuning_report_dto.g.dart';

@JsonSerializable()
class AutoscaleTuningReportDto {
  const AutoscaleTuningReportDto({required this.targets});

  factory AutoscaleTuningReportDto.fromJson(Map<String, Object?> json) =>
      _$AutoscaleTuningReportDtoFromJson(json);

  final List<AutoscaleTuningTargetDto> targets;

  Map<String, Object?> toJson() => _$AutoscaleTuningReportDtoToJson(this);
}
