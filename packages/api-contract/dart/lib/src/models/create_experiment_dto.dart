// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'experiment_guardrails_dto.dart';
import 'experiment_variant_dto.dart';

part 'create_experiment_dto.g.dart';

@JsonSerializable()
class CreateExperimentDto {
  const CreateExperimentDto({
    required this.key,
    required this.name,
    required this.surface,
    required this.variants,
    this.hypothesis,
    this.guardrails,
    this.endAt,
  });

  factory CreateExperimentDto.fromJson(Map<String, Object?> json) =>
      _$CreateExperimentDtoFromJson(json);

  final String key;
  final String name;
  final String? hypothesis;
  final String surface;
  final List<ExperimentVariantDto> variants;
  final ExperimentGuardrailsDto? guardrails;

  /// Stops by itself at this moment.
  final DateTime? endAt;

  Map<String, Object?> toJson() => _$CreateExperimentDtoToJson(this);
}
