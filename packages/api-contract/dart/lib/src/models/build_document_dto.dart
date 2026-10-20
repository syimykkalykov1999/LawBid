// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'build_document_dto.g.dart';

@JsonSerializable()
class BuildDocumentDto {
  const BuildDocumentDto({
    required this.templateId,
    required this.language,
    required this.values,
  });

  factory BuildDocumentDto.fromJson(Map<String, Object?> json) =>
      _$BuildDocumentDtoFromJson(json);

  final String templateId;

  /// A language the template has text in.
  final String language;

  /// The answers: field key → text.
  final Map<String, String> values;

  Map<String, Object?> toJson() => _$BuildDocumentDtoToJson(this);
}
