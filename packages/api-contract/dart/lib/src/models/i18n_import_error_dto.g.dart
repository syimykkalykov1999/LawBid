// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'i18n_import_error_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

I18nImportErrorDto _$I18nImportErrorDtoFromJson(Map<String, dynamic> json) =>
    I18nImportErrorDto(
      message: json['message'] as String,
      row: (json['row'] as num?)?.toInt(),
      key: json['key'] as String?,
      lang: json['lang'] as String?,
    );

Map<String, dynamic> _$I18nImportErrorDtoToJson(I18nImportErrorDto instance) =>
    <String, dynamic>{
      'row': ?instance.row,
      'key': ?instance.key,
      'lang': ?instance.lang,
      'message': instance.message,
    };
