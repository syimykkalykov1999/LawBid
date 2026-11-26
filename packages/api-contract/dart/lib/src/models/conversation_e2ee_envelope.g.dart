// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'conversation_e2ee_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConversationE2eeEnvelope _$ConversationE2eeEnvelopeFromJson(
  Map<String, dynamic> json,
) => ConversationE2eeEnvelope(
  data: ConversationE2eeDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ConversationE2eeEnvelopeToJson(
  ConversationE2eeEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
