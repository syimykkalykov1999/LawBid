// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'experiment_dto_status.dart';
import 'experiment_guardrails_dto.dart';
import 'experiment_result_dto.dart';
import 'experiment_variant_dto.dart';

part 'experiment_dto.g.dart';

@JsonSerializable()
class ExperimentDto {
  const ExperimentDto({
    required this.id,
    required this.key,
    required this.name,
    required this.hypothesis,
    required this.surface,
    required this.status,
    required this.variants,
    required this.trafficPercent,
    required this.guardrails,
    required this.startedAt,
    required this.endAt,
    required this.stoppedAt,
    required this.stopReason,
    required this.stoppedBySystem,
    required this.exposed,
    required this.latest,
  });

  factory ExperimentDto.fromJson(Map<String, Object?> json) =>
      _$ExperimentDtoFromJson(json);

  final String id;
  final String key;
  final String name;
  final String? hypothesis;
  final String surface;
  final ExperimentDtoStatus status;
  final List<ExperimentVariantDto> variants;
  final int trafficPercent;
  final ExperimentGuardrailsDto guardrails;
  final DateTime? startedAt;
  final DateTime? endAt;
  final DateTime? stoppedAt;
  final String? stopReason;
  final bool stoppedBySystem;

  /// Units that have been given a variant.
  final int exposed;
  final ExperimentResultDto? latest;

  Map<String, Object?> toJson() => _$ExperimentDtoToJson(this);
}
