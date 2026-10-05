// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'template_audience.dart';

part 'document_template_dto.g.dart';

@JsonSerializable()
class DocumentTemplateDto {
  const DocumentTemplateDto({
    required this.id,
    required this.title,
    required this.description,
    required this.fileName,
    required this.mime,
    required this.sizeBytes,
    required this.practiceAreaId,
    required this.practiceAreaKey,
    required this.practiceAreaName,
    required this.state,
    required this.language,
    required this.audience,
    required this.downloadCount,
    required this.updatedAt,
    required this.locked,
  });

  factory DocumentTemplateDto.fromJson(Map<String, Object?> json) =>
      _$DocumentTemplateDtoFromJson(json);

  final String id;
  final String title;
  final String description;
  final String fileName;
  final String mime;
  final num sizeBytes;
  final String? practiceAreaId;

  /// i18n key of the practice area name.
  final String? practiceAreaKey;

  /// English name of the practice area (fallback).
  final String? practiceAreaName;

  /// Two-letter state; null = every state.
  final String? state;
  final String language;
  final TemplateAudience audience;
  final num downloadCount;
  final DateTime updatedAt;

  /// True when the user's plan does not include document templates: the template can be browsed but not downloaded or attached.
  final bool locked;

  Map<String, Object?> toJson() => _$DocumentTemplateDtoToJson(this);
}
