// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'import_synonym_group_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ImportSynonymGroupDto _$ImportSynonymGroupDtoFromJson(
  Map<String, dynamic> json,
) => ImportSynonymGroupDto(
  key: json['key'] as String,
  terms: (json['terms'] as Map<String, dynamic>).map(
    (k, e) =>
        MapEntry(k, (e as List<dynamic>).map((e) => e as String).toList()),
  ),
  practice: json['practice'] as String?,
);

Map<String, dynamic> _$ImportSynonymGroupDtoToJson(
  ImportSynonymGroupDto instance,
) => <String, dynamic>{
  'key': instance.key,
  'practice': ?instance.practice,
  'terms': instance.terms,
};
