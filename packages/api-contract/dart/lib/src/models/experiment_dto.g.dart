// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'experiment_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ExperimentDto _$ExperimentDtoFromJson(
  Map<String, dynamic> json,
) => ExperimentDto(
  id: json['id'] as String,
  key: json['key'] as String,
  name: json['name'] as String,
  hypothesis: json['hypothesis'] as String?,
  surface: json['surface'] as String,
  status: ExperimentDtoStatus.fromJson(json['status'] as String),
  variants: (json['variants'] as List<dynamic>)
      .map((e) => ExperimentVariantDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  trafficPercent: (json['trafficPercent'] as num).toInt(),
  guardrails: ExperimentGuardrailsDto.fromJson(
    json['guardrails'] as Map<String, dynamic>,
  ),
  startedAt: json['startedAt'] == null
      ? null
      : DateTime.parse(json['startedAt'] as String),
  endAt: json['endAt'] == null ? null : DateTime.parse(json['endAt'] as String),
  stoppedAt: json['stoppedAt'] == null
      ? null
      : DateTime.parse(json['stoppedAt'] as String),
  stopReason: json['stopReason'] as String?,
  stoppedBySystem: json['stoppedBySystem'] as bool,
  exposed: (json['exposed'] as num).toInt(),
  latest: json['latest'] == null
      ? null
      : ExperimentResultDto.fromJson(json['latest'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ExperimentDtoToJson(ExperimentDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'key': instance.key,
      'name': instance.name,
      'hypothesis': ?instance.hypothesis,
      'surface': instance.surface,
      'status': instance.status.toJson(),
      'variants': instance.variants.map((e) => e.toJson()).toList(),
      'trafficPercent': instance.trafficPercent,
      'guardrails': instance.guardrails.toJson(),
      'startedAt': ?instance.startedAt?.toIso8601String(),
      'endAt': ?instance.endAt?.toIso8601String(),
      'stoppedAt': ?instance.stoppedAt?.toIso8601String(),
      'stopReason': ?instance.stopReason,
      'stoppedBySystem': instance.stoppedBySystem,
      'exposed': instance.exposed,
      'latest': ?instance.latest?.toJson(),
    };
