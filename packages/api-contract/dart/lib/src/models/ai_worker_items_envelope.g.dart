// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_worker_items_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiWorkerItemsEnvelope _$AiWorkerItemsEnvelopeFromJson(
  Map<String, dynamic> json,
) => AiWorkerItemsEnvelope(
  data: AiWorkerItemsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AiWorkerItemsEnvelopeToJson(
  AiWorkerItemsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
