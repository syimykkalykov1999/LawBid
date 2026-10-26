// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'search_index_generation_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SearchIndexGenerationDto _$SearchIndexGenerationDtoFromJson(
  Map<String, dynamic> json,
) => SearchIndexGenerationDto(
  name: json['name'] as String,
  generation: json['generation'] as num,
  docs: json['docs'] as num,
  sizeBytes: json['sizeBytes'] as num,
  role: SearchIndexGenerationDtoRole.fromJson(json['role'] as String),
);

Map<String, dynamic> _$SearchIndexGenerationDtoToJson(
  SearchIndexGenerationDto instance,
) => <String, dynamic>{
  'name': instance.name,
  'generation': instance.generation,
  'docs': instance.docs,
  'sizeBytes': instance.sizeBytes,
  'role': instance.role.toJson(),
};
