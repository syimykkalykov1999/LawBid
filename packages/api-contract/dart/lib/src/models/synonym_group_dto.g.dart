// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'synonym_group_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SynonymGroupDto _$SynonymGroupDtoFromJson(Map<String, dynamic> json) =>
    SynonymGroupDto(
      id: json['id'] as String,
      key: json['key'] as String,
      enabled: json['enabled'] as bool,
      source: SynonymGroupDtoSource.fromJson(json['source'] as String),
      terms: (json['terms'] as List<dynamic>)
          .map((e) => SynonymTermDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      practiceCode: json['practiceCode'] as String?,
    );

Map<String, dynamic> _$SynonymGroupDtoToJson(SynonymGroupDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'key': instance.key,
      'practiceCode': ?instance.practiceCode,
      'enabled': instance.enabled,
      'source': instance.source.toJson(),
      'terms': instance.terms.map((e) => e.toJson()).toList(),
    };
