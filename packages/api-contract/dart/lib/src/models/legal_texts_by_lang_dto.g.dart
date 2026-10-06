// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_texts_by_lang_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalTextsByLangDto _$LegalTextsByLangDtoFromJson(Map<String, dynamic> json) =>
    LegalTextsByLangDto(
      en: LegalTextsDto.fromJson(json['en'] as Map<String, dynamic>),
      ru: LegalTextsDto.fromJson(json['ru'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$LegalTextsByLangDtoToJson(
  LegalTextsByLangDto instance,
) => <String, dynamic>{'en': instance.en.toJson(), 'ru': instance.ru.toJson()};
