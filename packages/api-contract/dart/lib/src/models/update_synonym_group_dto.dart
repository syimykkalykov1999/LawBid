// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'synonym_term_dto.dart';

part 'update_synonym_group_dto.g.dart';

@JsonSerializable()
class UpdateSynonymGroupDto {
  const UpdateSynonymGroupDto({
    this.practiceCode,
    this.enabled,
    this.terms,
  });
  
  factory UpdateSynonymGroupDto.fromJson(Map<String, Object?> json) => _$UpdateSynonymGroupDtoFromJson(json);
  
  /// A practice code, or null to detach.
  final String? practiceCode;
  final bool? enabled;

  /// Replaces the whole list of phrases.
  final List<SynonymTermDto>? terms;

  Map<String, Object?> toJson() => _$UpdateSynonymGroupDtoToJson(this);
}
