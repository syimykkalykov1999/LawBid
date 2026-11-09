// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_assistant_status_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiAssistantStatusEnvelope _$AiAssistantStatusEnvelopeFromJson(
  Map<String, dynamic> json,
) => AiAssistantStatusEnvelope(
  data: AiAssistantStatusDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AiAssistantStatusEnvelopeToJson(
  AiAssistantStatusEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
