// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'conversation_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConversationListEnvelope _$ConversationListEnvelopeFromJson(
  Map<String, dynamic> json,
) => ConversationListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => ConversationDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ConversationListEnvelopeToJson(
  ConversationListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
