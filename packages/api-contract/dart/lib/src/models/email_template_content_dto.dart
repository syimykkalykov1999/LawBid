// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'email_template_content_dto.g.dart';

@JsonSerializable()
class EmailTemplateContentDto {
  const EmailTemplateContentDto({
    required this.subject,
    required this.textBody,
    this.htmlBody,
  });

  factory EmailTemplateContentDto.fromJson(Map<String, Object?> json) =>
      _$EmailTemplateContentDtoFromJson(json);

  /// Subject; `{{var}}` placeholders.
  final String subject;

  /// Plain-text body; `{{var}}` placeholders.
  final String textBody;

  /// Optional. Starts with `<` → raw HTML (values HTML-escaped). Otherwise text wrapped in the branded LawBid layout. Empty → the text body in the layout.
  final String? htmlBody;

  Map<String, Object?> toJson() => _$EmailTemplateContentDtoToJson(this);
}
