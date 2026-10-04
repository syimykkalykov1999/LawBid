// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'message_translation_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MessageTranslationEnvelope _$MessageTranslationEnvelopeFromJson(
  Map<String, dynamic> json,
) => MessageTranslationEnvelope(
  data: MessageTranslationDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$MessageTranslationEnvelopeToJson(
  MessageTranslationEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
