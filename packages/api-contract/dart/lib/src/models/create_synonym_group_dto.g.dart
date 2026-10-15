// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_synonym_group_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateSynonymGroupDto _$CreateSynonymGroupDtoFromJson(
  Map<String, dynamic> json,
) => CreateSynonymGroupDto(
  key: json['key'] as String,
  terms: (json['terms'] as List<dynamic>)
      .map((e) => SynonymTermDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  practiceCode: json['practiceCode'] as String?,
);

Map<String, dynamic> _$CreateSynonymGroupDtoToJson(
  CreateSynonymGroupDto instance,
) => <String, dynamic>{
  'key': instance.key,
  'practiceCode': ?instance.practiceCode,
  'terms': instance.terms.map((e) => e.toJson()).toList(),
};
