// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_worker_id_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiWorkerIdEnvelope _$AiWorkerIdEnvelopeFromJson(Map<String, dynamic> json) =>
    AiWorkerIdEnvelope(
      data: AiWorkerIdDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AiWorkerIdEnvelopeToJson(AiWorkerIdEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
