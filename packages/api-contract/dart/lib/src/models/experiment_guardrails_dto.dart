// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'experiment_guardrails_dto.g.dart';

@JsonSerializable()
class ExperimentGuardrailsDto {
  const ExperimentGuardrailsDto({
    this.reportsRelIncreasePct,
    this.errorsRelIncreasePct,
    this.minImpressions,
  });

  factory ExperimentGuardrailsDto.fromJson(Map<String, Object?> json) =>
      _$ExperimentGuardrailsDtoFromJson(json);

  /// Stop when reports per 1000 impressions grow by more than this percent vs control.
  final int? reportsRelIncreasePct;

  /// Same for errors per 1000 impressions.
  final int? errorsRelIncreasePct;

  /// Do not judge a guardrail before this many impressions per variant.
  final int? minImpressions;

  Map<String, Object?> toJson() => _$ExperimentGuardrailsDtoToJson(this);
}
