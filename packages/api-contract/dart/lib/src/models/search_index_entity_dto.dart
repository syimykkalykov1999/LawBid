// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'search_index_entity_dto_entity.dart';
import 'search_index_generation_dto.dart';

part 'search_index_entity_dto.g.dart';

@JsonSerializable()
class SearchIndexEntityDto {
  const SearchIndexEntityDto({
    required this.entity,
    required this.readTarget,
    required this.writeTarget,
    required this.mappingOutdated,
    required this.indexes,
  });
  
  factory SearchIndexEntityDto.fromJson(Map<String, Object?> json) => _$SearchIndexEntityDtoFromJson(json);
  
  final SearchIndexEntityDtoEntity entity;
  final String? readTarget;
  final String? writeTarget;

  /// The live mapping is older than the code.
  final bool mappingOutdated;
  final List<SearchIndexGenerationDto> indexes;

  Map<String, Object?> toJson() => _$SearchIndexEntityDtoToJson(this);
}
