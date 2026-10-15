// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'import_synonyms_result_dto.g.dart';

@JsonSerializable()
class ImportSynonymsResultDto {
  const ImportSynonymsResultDto({
    required this.groupsCreated,
    required this.groupsUpdated,
    required this.termsAdded,
    required this.unknownPractices,
  });

  factory ImportSynonymsResultDto.fromJson(Map<String, Object?> json) =>
      _$ImportSynonymsResultDtoFromJson(json);

  final num groupsCreated;
  final num groupsUpdated;
  final num termsAdded;
  final List<String> unknownPractices;

  Map<String, Object?> toJson() => _$ImportSynonymsResultDtoToJson(this);
}
