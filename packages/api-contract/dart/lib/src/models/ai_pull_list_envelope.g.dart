// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_pull_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiPullListEnvelope _$AiPullListEnvelopeFromJson(Map<String, dynamic> json) =>
    AiPullListEnvelope(
      data: AiPullListDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AiPullListEnvelopeToJson(AiPullListEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
