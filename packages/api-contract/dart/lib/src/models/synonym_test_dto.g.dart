// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'synonym_test_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SynonymTestDto _$SynonymTestDtoFromJson(Map<String, dynamic> json) =>
    SynonymTestDto(
      groupKeys: (json['groupKeys'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      practiceCodes: (json['practiceCodes'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$SynonymTestDtoToJson(SynonymTestDto instance) =>
    <String, dynamic>{
      'groupKeys': instance.groupKeys,
      'practiceCodes': instance.practiceCodes,
    };
