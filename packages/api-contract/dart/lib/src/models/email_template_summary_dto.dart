// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'email_template_locale_status_dto.dart';
import 'email_template_summary_dto_key.dart';
import 'email_template_variable_dto.dart';

part 'email_template_summary_dto.g.dart';

@JsonSerializable()
class EmailTemplateSummaryDto {
  const EmailTemplateSummaryDto({
    required this.key,
    required this.title,
    required this.description,
    required this.variables,
    required this.locales,
  });

  factory EmailTemplateSummaryDto.fromJson(Map<String, Object?> json) =>
      _$EmailTemplateSummaryDtoFromJson(json);

  final EmailTemplateSummaryDtoKey key;

  /// Russian title for the admin.
  final String title;
  final String description;
  final List<EmailTemplateVariableDto> variables;
  final List<EmailTemplateLocaleStatusDto> locales;

  Map<String, Object?> toJson() => _$EmailTemplateSummaryDtoToJson(this);
}
