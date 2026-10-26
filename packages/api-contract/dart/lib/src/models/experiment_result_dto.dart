// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'experiment_result_dto.g.dart';

@JsonSerializable()
class ExperimentResultDto {
  const ExperimentResultDto({
    required this.computedAt,
    required this.srmP,
    required this.srmFlag,
    required this.guardrailTripped,
    required this.summary,
    required this.report,
  });

  factory ExperimentResultDto.fromJson(Map<String, Object?> json) =>
      _$ExperimentResultDtoFromJson(json);

  final DateTime computedAt;
  final num? srmP;
  final bool srmFlag;
  final bool guardrailTripped;

  /// Plain-Russian lines for the page.
  final List<String> summary;

  /// Full report: exposures, per-variant metrics with intervals.
  final dynamic report;

  Map<String, Object?> toJson() => _$ExperimentResultDtoToJson(this);
}
