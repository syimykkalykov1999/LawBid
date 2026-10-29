// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'search_index_generation_dto_role.dart';

part 'search_index_generation_dto.g.dart';

@JsonSerializable()
class SearchIndexGenerationDto {
  const SearchIndexGenerationDto({
    required this.name,
    required this.generation,
    required this.docs,
    required this.sizeBytes,
    required this.role,
  });
  
  factory SearchIndexGenerationDto.fromJson(Map<String, Object?> json) => _$SearchIndexGenerationDtoFromJson(json);
  
  final String name;
  final num generation;
  final num docs;
  final num sizeBytes;
  final SearchIndexGenerationDtoRole role;

  Map<String, Object?> toJson() => _$SearchIndexGenerationDtoToJson(this);
}
