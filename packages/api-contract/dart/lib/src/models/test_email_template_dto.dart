// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'test_email_template_dto.g.dart';

@JsonSerializable()
class TestEmailTemplateDto {
  const TestEmailTemplateDto({this.subject, this.textBody, this.htmlBody});

  factory TestEmailTemplateDto.fromJson(Map<String, Object?> json) =>
      _$TestEmailTemplateDtoFromJson(json);

  final String? subject;
  final String? textBody;
  final String? htmlBody;

  Map<String, Object?> toJson() => _$TestEmailTemplateDtoToJson(this);
}
