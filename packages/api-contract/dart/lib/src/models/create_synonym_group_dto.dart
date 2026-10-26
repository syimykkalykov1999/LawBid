// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'synonym_term_dto.dart';

part 'create_synonym_group_dto.g.dart';

@JsonSerializable()
class CreateSynonymGroupDto {
  const CreateSynonymGroupDto({
    required this.key,
    required this.terms,
    this.practiceCode,
  });

  factory CreateSynonymGroupDto.fromJson(Map<String, Object?> json) =>
      _$CreateSynonymGroupDtoFromJson(json);

  /// Short unique name.
  final String key;

  /// Practice area code the group points at.
  final String? practiceCode;
  final List<SynonymTermDto> terms;

  Map<String, Object?> toJson() => _$CreateSynonymGroupDtoToJson(this);
}
