// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_language_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateLanguageDto _$UpdateLanguageDtoFromJson(Map<String, dynamic> json) =>
    UpdateLanguageDto(
      isActive: json['isActive'] as bool?,
      sort: (json['sort'] as num?)?.toInt(),
    );

Map<String, dynamic> _$UpdateLanguageDtoToJson(UpdateLanguageDto instance) =>
    <String, dynamic>{'isActive': ?instance.isActive, 'sort': ?instance.sort};
