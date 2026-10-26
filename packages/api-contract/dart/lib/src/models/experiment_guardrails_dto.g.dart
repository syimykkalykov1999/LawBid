// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'experiment_guardrails_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ExperimentGuardrailsDto _$ExperimentGuardrailsDtoFromJson(
  Map<String, dynamic> json,
) => ExperimentGuardrailsDto(
  reportsRelIncreasePct: (json['reportsRelIncreasePct'] as num?)?.toInt(),
  errorsRelIncreasePct: (json['errorsRelIncreasePct'] as num?)?.toInt(),
  minImpressions: (json['minImpressions'] as num?)?.toInt(),
);

Map<String, dynamic> _$ExperimentGuardrailsDtoToJson(
  ExperimentGuardrailsDto instance,
) => <String, dynamic>{
  'reportsRelIncreasePct': ?instance.reportsRelIncreasePct,
  'errorsRelIncreasePct': ?instance.errorsRelIncreasePct,
  'minImpressions': ?instance.minImpressions,
};
