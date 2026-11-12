// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_worker_run_started_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiWorkerRunStartedEnvelope _$AiWorkerRunStartedEnvelopeFromJson(
  Map<String, dynamic> json,
) => AiWorkerRunStartedEnvelope(
  data: AiWorkerRunStartedDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AiWorkerRunStartedEnvelopeToJson(
  AiWorkerRunStartedEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
