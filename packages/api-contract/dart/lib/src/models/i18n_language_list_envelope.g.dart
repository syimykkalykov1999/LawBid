// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'i18n_language_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

I18nLanguageListEnvelope _$I18nLanguageListEnvelopeFromJson(
  Map<String, dynamic> json,
) => I18nLanguageListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => I18nLanguageDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$I18nLanguageListEnvelopeToJson(
  I18nLanguageListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
