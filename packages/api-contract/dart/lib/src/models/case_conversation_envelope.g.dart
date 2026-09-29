// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_conversation_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseConversationEnvelope _$CaseConversationEnvelopeFromJson(
  Map<String, dynamic> json,
) => CaseConversationEnvelope(
  data: CaseConversationDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CaseConversationEnvelopeToJson(
  CaseConversationEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
