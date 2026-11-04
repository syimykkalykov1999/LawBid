// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reco_qa_status_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RecoQaStatusDto _$RecoQaStatusDtoFromJson(Map<String, dynamic> json) =>
    RecoQaStatusDto(
      enabled: json['enabled'] as bool,
      lastRunAt: json['lastRunAt'] as String?,
      durationMs: json['durationMs'] as num,
      attorneys: json['attorneys'] as num,
      questions: json['questions'] as num,
      cases: json['cases'] as num,
      queued: json['queued'] as bool,
    );

Map<String, dynamic> _$RecoQaStatusDtoToJson(RecoQaStatusDto instance) =>
    <String, dynamic>{
      'enabled': instance.enabled,
      'lastRunAt': ?instance.lastRunAt,
      'durationMs': instance.durationMs,
      'attorneys': instance.attorneys,
      'questions': instance.questions,
      'cases': instance.cases,
      'queued': instance.queued,
    };
