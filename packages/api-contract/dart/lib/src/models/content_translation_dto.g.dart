// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'content_translation_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ContentTranslationDto _$ContentTranslationDtoFromJson(
  Map<String, dynamic> json,
) => ContentTranslationDto(
  text: json['text'] as String,
  sourceLanguage: json['sourceLanguage'] as String?,
  targetLanguage: json['targetLanguage'] as String,
);

Map<String, dynamic> _$ContentTranslationDtoToJson(
  ContentTranslationDto instance,
) => <String, dynamic>{
  'text': instance.text,
  'sourceLanguage': ?instance.sourceLanguage,
  'targetLanguage': instance.targetLanguage,
};
