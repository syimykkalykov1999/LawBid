// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'save_email_template_dto.g.dart';

@JsonSerializable()
class SaveEmailTemplateDto {
  const SaveEmailTemplateDto({
    required this.subject,
    required this.textBody,
    required this.enabled,
    this.htmlBody,
  });

  factory SaveEmailTemplateDto.fromJson(Map<String, Object?> json) =>
      _$SaveEmailTemplateDtoFromJson(json);

  /// Subject; `{{var}}` placeholders.
  final String subject;

  /// Plain-text body; `{{var}}` placeholders.
  final String textBody;

  /// Optional. Starts with `<` → raw HTML (values HTML-escaped). Otherwise text wrapped in the branded LawBid layout. Empty → the text body in the layout.
  final String? htmlBody;

  /// false keeps the text but sends the built-in.
  final bool enabled;

  Map<String, Object?> toJson() => _$SaveEmailTemplateDtoToJson(this);
}
