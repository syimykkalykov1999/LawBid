// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'template_audience.dart';

part 'create_document_template_dto.g.dart';

@JsonSerializable()
class CreateDocumentTemplateDto {
  const CreateDocumentTemplateDto({
    required this.fileId,
    required this.title,
    this.description,
    this.fileName,
    this.practiceAreaId,
    this.state,
    this.language,
    this.audience,
    this.published,
  });

  factory CreateDocumentTemplateDto.fromJson(Map<String, Object?> json) =>
      _$CreateDocumentTemplateDtoFromJson(json);

  final String? description;

  /// Name the file is saved under, e.g. "lease.pdf".
  final String? fileName;
  final String? practiceAreaId;

  /// Two-letter state; null = every state.
  final String? state;
  final String? language;
  final TemplateAudience? audience;
  final bool? published;

  /// A clean uploaded template file.
  final String fileId;
  final String title;

  Map<String, Object?> toJson() => _$CreateDocumentTemplateDtoToJson(this);
}
