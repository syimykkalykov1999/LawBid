// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'form_field_dto.dart';

part 'form_template_dto.g.dart';

@JsonSerializable()
class FormTemplateDto {
  const FormTemplateDto({
    required this.id,
    required this.slug,
    required this.title,
    required this.description,
    required this.languages,
    required this.fields,
  });

  factory FormTemplateDto.fromJson(Map<String, Object?> json) =>
      _$FormTemplateDtoFromJson(json);

  final String id;
  final String slug;
  final Map<String, String> title;
  final Map<String, String> description;

  /// Languages the text exists in.
  final List<String> languages;
  final List<FormFieldDto> fields;

  Map<String, Object?> toJson() => _$FormTemplateDtoToJson(this);
}
