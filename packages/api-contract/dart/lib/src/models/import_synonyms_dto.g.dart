// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'import_synonyms_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ImportSynonymsDto _$ImportSynonymsDtoFromJson(Map<String, dynamic> json) =>
    ImportSynonymsDto(
      groups: (json['groups'] as List<dynamic>)
          .map((e) => ImportSynonymGroupDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$ImportSynonymsDtoToJson(ImportSynonymsDto instance) =>
    <String, dynamic>{
      'groups': instance.groups.map((e) => e.toJson()).toList(),
    };
