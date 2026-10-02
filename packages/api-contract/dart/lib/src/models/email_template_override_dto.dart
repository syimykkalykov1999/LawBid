// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'email_template_override_dto.g.dart';

@JsonSerializable()
class EmailTemplateOverrideDto {
  const EmailTemplateOverrideDto({
    required this.subject,
    required this.textBody,
    required this.enabled,
    required this.updatedAt,
    this.htmlBody,
    this.updatedBy,
  });

  factory EmailTemplateOverrideDto.fromJson(Map<String, Object?> json) =>
      _$EmailTemplateOverrideDtoFromJson(json);

  final String subject;
  final String textBody;
  final String? htmlBody;
  final bool enabled;
  final String? updatedBy;
  final DateTime updatedAt;

  Map<String, Object?> toJson() => _$EmailTemplateOverrideDtoToJson(this);
}
