// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_purged_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiPurgedEnvelope _$AiPurgedEnvelopeFromJson(Map<String, dynamic> json) =>
    AiPurgedEnvelope(
      data: AiPurgedDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AiPurgedEnvelopeToJson(AiPurgedEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
