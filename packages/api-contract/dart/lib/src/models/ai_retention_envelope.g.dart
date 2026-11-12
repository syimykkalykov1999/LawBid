// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_retention_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiRetentionEnvelope _$AiRetentionEnvelopeFromJson(Map<String, dynamic> json) =>
    AiRetentionEnvelope(
      data: AiRetentionDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AiRetentionEnvelopeToJson(
  AiRetentionEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
