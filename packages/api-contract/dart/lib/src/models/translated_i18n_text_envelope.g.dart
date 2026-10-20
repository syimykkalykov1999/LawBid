// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'translated_i18n_text_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TranslatedI18nTextEnvelope _$TranslatedI18nTextEnvelopeFromJson(
  Map<String, dynamic> json,
) => TranslatedI18nTextEnvelope(
  data: TranslatedI18nTextDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$TranslatedI18nTextEnvelopeToJson(
  TranslatedI18nTextEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
