// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'form_field_dto.dart';

part 'update_form_template_dto.g.dart';

@JsonSerializable()
class UpdateFormTemplateDto {
  const UpdateFormTemplateDto({
    this.title,
    this.description,
    this.body,
    this.fields,
    this.practiceAreaId,
    this.position,
    this.published,
  });
  
  factory UpdateFormTemplateDto.fromJson(Map<String, Object?> json) => _$UpdateFormTemplateDtoFromJson(json);
  
  final Map<String, String>? title;
  final Map<String, String>? description;
  final Map<String, String>? body;
  final List<FormFieldDto>? fields;
  final String? practiceAreaId;
  final num? position;
  final bool? published;

  Map<String, Object?> toJson() => _$UpdateFormTemplateDtoToJson(this);
}
