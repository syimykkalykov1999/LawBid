// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'i18n_bundle_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

I18nBundleDto _$I18nBundleDtoFromJson(Map<String, dynamic> json) =>
    I18nBundleDto(
      lang: json['lang'] as String,
      version: (json['version'] as num).toInt(),
      translations: Map<String, String>.from(json['translations'] as Map),
    );

Map<String, dynamic> _$I18nBundleDtoToJson(I18nBundleDto instance) =>
    <String, dynamic>{
      'lang': instance.lang,
      'version': instance.version,
      'translations': instance.translations,
    };
