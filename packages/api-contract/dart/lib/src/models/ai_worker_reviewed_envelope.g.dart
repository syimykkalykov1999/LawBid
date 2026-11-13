// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_worker_reviewed_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiWorkerReviewedEnvelope _$AiWorkerReviewedEnvelopeFromJson(
  Map<String, dynamic> json,
) => AiWorkerReviewedEnvelope(
  data: AiWorkerReviewedDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AiWorkerReviewedEnvelopeToJson(
  AiWorkerReviewedEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
