// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'import_synonym_group_dto.g.dart';

@JsonSerializable()
class ImportSynonymGroupDto {
  const ImportSynonymGroupDto({
    required this.key,
    required this.terms,
    this.practice,
  });

  factory ImportSynonymGroupDto.fromJson(Map<String, Object?> json) =>
      _$ImportSynonymGroupDtoFromJson(json);

  final String key;
  final String? practice;
  final Map<String, List<String>> terms;

  Map<String, Object?> toJson() => _$ImportSynonymGroupDtoToJson(this);
}
