// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'message_translation_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MessageTranslationDto _$MessageTranslationDtoFromJson(
  Map<String, dynamic> json,
) => MessageTranslationDto(
  text: json['text'] as String,
  sourceLanguage: json['sourceLanguage'] as String?,
  targetLanguage: json['targetLanguage'] as String,
);

Map<String, dynamic> _$MessageTranslationDtoToJson(
  MessageTranslationDto instance,
) => <String, dynamic>{
  'text': instance.text,
  'sourceLanguage': ?instance.sourceLanguage,
  'targetLanguage': instance.targetLanguage,
};
