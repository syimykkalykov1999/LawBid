// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'experiment_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ExperimentResultDto _$ExperimentResultDtoFromJson(Map<String, dynamic> json) =>
    ExperimentResultDto(
      computedAt: DateTime.parse(json['computedAt'] as String),
      srmP: json['srmP'] as num?,
      srmFlag: json['srmFlag'] as bool,
      guardrailTripped: json['guardrailTripped'] as bool,
      summary: (json['summary'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      report: json['report'],
    );

Map<String, dynamic> _$ExperimentResultDtoToJson(
  ExperimentResultDto instance,
) => <String, dynamic>{
  'computedAt': instance.computedAt.toIso8601String(),
  'srmP': ?instance.srmP,
  'srmFlag': instance.srmFlag,
  'guardrailTripped': instance.guardrailTripped,
  'summary': instance.summary,
  'report': ?instance.report,
};
