// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_synonym_group_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateSynonymGroupDto _$UpdateSynonymGroupDtoFromJson(
  Map<String, dynamic> json,
) => UpdateSynonymGroupDto(
  practiceCode: json['practiceCode'] as String?,
  enabled: json['enabled'] as bool?,
  terms: (json['terms'] as List<dynamic>?)
      ?.map((e) => SynonymTermDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$UpdateSynonymGroupDtoToJson(
  UpdateSynonymGroupDto instance,
) => <String, dynamic>{
  'practiceCode': ?instance.practiceCode,
  'enabled': ?instance.enabled,
  'terms': ?instance.terms?.map((e) => e.toJson()).toList(),
};
