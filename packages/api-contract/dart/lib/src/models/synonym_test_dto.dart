// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'synonym_test_dto.g.dart';

@JsonSerializable()
class SynonymTestDto {
  const SynonymTestDto({required this.groupKeys, required this.practiceCodes});

  factory SynonymTestDto.fromJson(Map<String, Object?> json) =>
      _$SynonymTestDtoFromJson(json);

  final List<String> groupKeys;
  final List<String> practiceCodes;

  Map<String, Object?> toJson() => _$SynonymTestDtoToJson(this);
}
