// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'assistant_me_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AssistantMeEnvelope _$AssistantMeEnvelopeFromJson(Map<String, dynamic> json) =>
    AssistantMeEnvelope(
      data: AssistantMeDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AssistantMeEnvelopeToJson(
  AssistantMeEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
