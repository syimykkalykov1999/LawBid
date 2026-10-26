// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_experiment_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateExperimentDto _$CreateExperimentDtoFromJson(Map<String, dynamic> json) =>
    CreateExperimentDto(
      key: json['key'] as String,
      name: json['name'] as String,
      surface: json['surface'] as String,
      variants: (json['variants'] as List<dynamic>)
          .map((e) => ExperimentVariantDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      hypothesis: json['hypothesis'] as String?,
      guardrails: json['guardrails'] == null
          ? null
          : ExperimentGuardrailsDto.fromJson(
              json['guardrails'] as Map<String, dynamic>,
            ),
      endAt: json['endAt'] == null
          ? null
          : DateTime.parse(json['endAt'] as String),
    );

Map<String, dynamic> _$CreateExperimentDtoToJson(
  CreateExperimentDto instance,
) => <String, dynamic>{
  'key': instance.key,
  'name': instance.name,
  'hypothesis': ?instance.hypothesis,
  'surface': instance.surface,
  'variants': instance.variants.map((e) => e.toJson()).toList(),
  'guardrails': ?instance.guardrails?.toJson(),
  'endAt': ?instance.endAt?.toIso8601String(),
};
