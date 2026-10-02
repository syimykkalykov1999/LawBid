// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'email_template_preview_dto.g.dart';

@JsonSerializable()
class EmailTemplatePreviewDto {
  const EmailTemplatePreviewDto({
    required this.subject,
    required this.text,
    required this.unknownVariables,
    this.html,
  });

  factory EmailTemplatePreviewDto.fromJson(Map<String, Object?> json) =>
      _$EmailTemplatePreviewDtoFromJson(json);

  final String subject;
  final String text;
  final String? html;

  /// Placeholders not in the catalog (rendered empty).
  final List<String> unknownVariables;

  Map<String, Object?> toJson() => _$EmailTemplatePreviewDtoToJson(this);
}
