// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'translated_i18n_text_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TranslatedI18nTextDto _$TranslatedI18nTextDtoFromJson(
  Map<String, dynamic> json,
) => TranslatedI18nTextDto(
  values: Map<String, String>.from(json['values'] as Map),
  failed: (json['failed'] as List<dynamic>).map((e) => e as String).toList(),
);

Map<String, dynamic> _$TranslatedI18nTextDtoToJson(
  TranslatedI18nTextDto instance,
) => <String, dynamic>{'values': instance.values, 'failed': instance.failed};
