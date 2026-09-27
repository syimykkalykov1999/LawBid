// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'i18n_language_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

I18nLanguageDto _$I18nLanguageDtoFromJson(Map<String, dynamic> json) =>
    I18nLanguageDto(
      code: json['code'] as String,
      nameNative: json['name_native'] as String,
      isActive: json['is_active'] as bool,
      isRtl: json['is_rtl'] as bool,
      sort: (json['sort'] as num).toInt(),
    );

Map<String, dynamic> _$I18nLanguageDtoToJson(I18nLanguageDto instance) =>
    <String, dynamic>{
      'code': instance.code,
      'name_native': instance.nameNative,
      'is_active': instance.isActive,
      'is_rtl': instance.isRtl,
      'sort': instance.sort,
    };
