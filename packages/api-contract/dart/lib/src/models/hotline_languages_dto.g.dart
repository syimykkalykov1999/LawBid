// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_languages_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineLanguagesDto _$HotlineLanguagesDtoFromJson(Map<String, dynamic> json) =>
    HotlineLanguagesDto(
      languages: (json['languages'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$HotlineLanguagesDtoToJson(
  HotlineLanguagesDto instance,
) => <String, dynamic>{'languages': instance.languages};
