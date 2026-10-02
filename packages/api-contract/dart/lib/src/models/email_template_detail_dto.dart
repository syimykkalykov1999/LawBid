// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'email_template_detail_dto_key.dart';
import 'email_template_detail_dto_locale.dart';
import 'email_template_override_dto.dart';
import 'email_template_variable_dto.dart';
import 'rendered_email_dto.dart';

part 'email_template_detail_dto.g.dart';

@JsonSerializable()
class EmailTemplateDetailDto {
  const EmailTemplateDetailDto({
    required this.key,
    required this.locale,
    required this.title,
    required this.description,
    required this.variables,
    required this.defaultRendered,
    this.override,
  });

  factory EmailTemplateDetailDto.fromJson(Map<String, Object?> json) =>
      _$EmailTemplateDetailDtoFromJson(json);

  final EmailTemplateDetailDtoKey key;
  final EmailTemplateDetailDtoLocale locale;
  final String title;
  final String description;
  final List<EmailTemplateVariableDto> variables;

  /// The built-in email with sample values (built-ins are English for every locale).
  final RenderedEmailDto defaultRendered;
  final EmailTemplateOverrideDto? override;

  Map<String, Object?> toJson() => _$EmailTemplateDetailDtoToJson(this);
}
