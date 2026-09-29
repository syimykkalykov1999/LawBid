// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'language_admin_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LanguageAdminDto _$LanguageAdminDtoFromJson(Map<String, dynamic> json) =>
    LanguageAdminDto(
      code: json['code'] as String,
      nameNative: json['nameNative'] as String,
      isActive: json['isActive'] as bool,
      isRtl: json['isRtl'] as bool,
      sort: (json['sort'] as num).toInt(),
      translations: (json['translations'] as num).toInt(),
      bundleVersion: (json['bundleVersion'] as num).toInt(),
    );

Map<String, dynamic> _$LanguageAdminDtoToJson(LanguageAdminDto instance) =>
    <String, dynamic>{
      'code': instance.code,
      'nameNative': instance.nameNative,
      'isActive': instance.isActive,
      'isRtl': instance.isRtl,
      'sort': instance.sort,
      'translations': instance.translations,
      'bundleVersion': instance.bundleVersion,
    };
