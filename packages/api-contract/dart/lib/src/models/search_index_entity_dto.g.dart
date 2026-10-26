// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'search_index_entity_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SearchIndexEntityDto _$SearchIndexEntityDtoFromJson(
  Map<String, dynamic> json,
) => SearchIndexEntityDto(
  entity: SearchIndexEntityDtoEntity.fromJson(json['entity'] as String),
  readTarget: json['readTarget'] as String?,
  writeTarget: json['writeTarget'] as String?,
  mappingOutdated: json['mappingOutdated'] as bool,
  indexes: (json['indexes'] as List<dynamic>)
      .map((e) => SearchIndexGenerationDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$SearchIndexEntityDtoToJson(
  SearchIndexEntityDto instance,
) => <String, dynamic>{
  'entity': instance.entity.toJson(),
  'readTarget': ?instance.readTarget,
  'writeTarget': ?instance.writeTarget,
  'mappingOutdated': instance.mappingOutdated,
  'indexes': instance.indexes.map((e) => e.toJson()).toList(),
};
