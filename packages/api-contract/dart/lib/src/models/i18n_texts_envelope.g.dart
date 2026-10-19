// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'i18n_texts_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

I18nTextsEnvelope _$I18nTextsEnvelopeFromJson(Map<String, dynamic> json) =>
    I18nTextsEnvelope(
      data: I18nTextsDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$I18nTextsEnvelopeToJson(I18nTextsEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
