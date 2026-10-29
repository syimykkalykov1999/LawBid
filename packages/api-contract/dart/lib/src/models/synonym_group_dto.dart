// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'synonym_group_dto_source.dart';
import 'synonym_term_dto.dart';

part 'synonym_group_dto.g.dart';

@JsonSerializable()
class SynonymGroupDto {
  const SynonymGroupDto({
    required this.id,
    required this.key,
    required this.enabled,
    required this.source,
    required this.terms,
    this.practiceCode,
  });
  
  factory SynonymGroupDto.fromJson(Map<String, Object?> json) => _$SynonymGroupDtoFromJson(json);
  
  final String id;
  final String key;

  /// Code of the practice area the group points at.
  final String? practiceCode;
  final bool enabled;
  final SynonymGroupDtoSource source;
  final List<SynonymTermDto> terms;

  Map<String, Object?> toJson() => _$SynonymGroupDtoToJson(this);
}
