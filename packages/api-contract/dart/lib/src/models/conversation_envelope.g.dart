// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'conversation_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConversationEnvelope _$ConversationEnvelopeFromJson(
  Map<String, dynamic> json,
) => ConversationEnvelope(
  data: ConversationDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ConversationEnvelopeToJson(
  ConversationEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
