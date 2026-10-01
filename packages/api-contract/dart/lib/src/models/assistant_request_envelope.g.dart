// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'assistant_request_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AssistantRequestEnvelope _$AssistantRequestEnvelopeFromJson(
  Map<String, dynamic> json,
) => AssistantRequestEnvelope(
  data: AssistantRequestDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AssistantRequestEnvelopeToJson(
  AssistantRequestEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
