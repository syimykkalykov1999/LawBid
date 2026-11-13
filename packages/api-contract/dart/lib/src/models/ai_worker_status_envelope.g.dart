// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_worker_status_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiWorkerStatusEnvelope _$AiWorkerStatusEnvelopeFromJson(
  Map<String, dynamic> json,
) => AiWorkerStatusEnvelope(
  data: AiWorkerStatusDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AiWorkerStatusEnvelopeToJson(
  AiWorkerStatusEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
