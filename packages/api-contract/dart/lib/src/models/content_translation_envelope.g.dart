// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'content_translation_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ContentTranslationEnvelope _$ContentTranslationEnvelopeFromJson(
  Map<String, dynamic> json,
) => ContentTranslationEnvelope(
  data: ContentTranslationDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ContentTranslationEnvelopeToJson(
  ContentTranslationEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
