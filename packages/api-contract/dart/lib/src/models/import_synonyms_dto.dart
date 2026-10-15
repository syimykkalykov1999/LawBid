// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'import_synonym_group_dto.dart';

part 'import_synonyms_dto.g.dart';

@JsonSerializable()
class ImportSynonymsDto {
  const ImportSynonymsDto({required this.groups});

  factory ImportSynonymsDto.fromJson(Map<String, Object?> json) =>
      _$ImportSynonymsDtoFromJson(json);

  final List<ImportSynonymGroupDto> groups;

  Map<String, Object?> toJson() => _$ImportSynonymsDtoToJson(this);
}
