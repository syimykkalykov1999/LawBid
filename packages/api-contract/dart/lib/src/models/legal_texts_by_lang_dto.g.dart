// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_texts_by_lang_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalTextsByLangDto _$LegalTextsByLangDtoFromJson(Map<String, dynamic> json) =>
    LegalTextsByLangDto(
      en: LegalTextsDto.fromJson(json['en'] as Map<String, dynamic>),
      ru: LegalTextsDto.fromJson(json['ru'] as Map<String, dynamic>),
      es: json['es'] == null
          ? null
          : LegalTextsDto.fromJson(json['es'] as Map<String, dynamic>),
      fr: json['fr'] == null
          ? null
          : LegalTextsDto.fromJson(json['fr'] as Map<String, dynamic>),
      de: json['de'] == null
          ? null
          : LegalTextsDto.fromJson(json['de'] as Map<String, dynamic>),
      it: json['it'] == null
          ? null
          : LegalTextsDto.fromJson(json['it'] as Map<String, dynamic>),
      pt: json['pt'] == null
          ? null
          : LegalTextsDto.fromJson(json['pt'] as Map<String, dynamic>),
      nl: json['nl'] == null
          ? null
          : LegalTextsDto.fromJson(json['nl'] as Map<String, dynamic>),
      pl: json['pl'] == null
          ? null
          : LegalTextsDto.fromJson(json['pl'] as Map<String, dynamic>),
      uk: json['uk'] == null
          ? null
          : LegalTextsDto.fromJson(json['uk'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$LegalTextsByLangDtoToJson(
  LegalTextsByLangDto instance,
) => <String, dynamic>{
  'en': instance.en.toJson(),
  'ru': instance.ru.toJson(),
  'es': ?instance.es?.toJson(),
  'fr': ?instance.fr?.toJson(),
  'de': ?instance.de?.toJson(),
  'it': ?instance.it?.toJson(),
  'pt': ?instance.pt?.toJson(),
  'nl': ?instance.nl?.toJson(),
  'pl': ?instance.pl?.toJson(),
  'uk': ?instance.uk?.toJson(),
};
