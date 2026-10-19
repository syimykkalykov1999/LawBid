// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'i18n_texts_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

I18nTextsDto _$I18nTextsDtoFromJson(Map<String, dynamic> json) => I18nTextsDto(
  languages: (json['languages'] as List<dynamic>)
      .map((e) => I18nTextLanguageDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  keys: (json['keys'] as List<dynamic>)
      .map((e) => I18nTextRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$I18nTextsDtoToJson(I18nTextsDto instance) =>
    <String, dynamic>{
      'languages': instance.languages.map((e) => e.toJson()).toList(),
      'keys': instance.keys.map((e) => e.toJson()).toList(),
    };
