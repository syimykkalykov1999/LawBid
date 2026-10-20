// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'form_template_dto.dart';

part 'case_form_templates_dto.g.dart';

@JsonSerializable()
class CaseFormTemplatesDto {
  const CaseFormTemplatesDto({required this.prefill, required this.templates});

  factory CaseFormTemplatesDto.fromJson(Map<String, Object?> json) =>
      _$CaseFormTemplatesDtoFromJson(json);

  /// Values the app fills in: today, attorney_name, client_name, case_title.
  final Map<String, String> prefill;
  final List<FormTemplateDto> templates;

  Map<String, Object?> toJson() => _$CaseFormTemplatesDtoToJson(this);
}
