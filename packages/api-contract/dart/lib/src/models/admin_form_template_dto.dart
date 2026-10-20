// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'form_field_dto.dart';

part 'admin_form_template_dto.g.dart';

@JsonSerializable()
class AdminFormTemplateDto {
  const AdminFormTemplateDto({
    required this.id,
    required this.slug,
    required this.title,
    required this.description,
    required this.body,
    required this.fields,
    required this.practiceAreaId,
    required this.position,
    required this.published,
    required this.updatedAt,
  });

  factory AdminFormTemplateDto.fromJson(Map<String, Object?> json) =>
      _$AdminFormTemplateDtoFromJson(json);

  final String id;
  final String slug;
  final Map<String, String> title;
  final Map<String, String> description;

  /// Language → text with {{key}} places.
  final Map<String, String> body;
  final List<FormFieldDto> fields;
  final String? practiceAreaId;
  final num position;
  final bool published;
  final DateTime updatedAt;

  Map<String, Object?> toJson() => _$AdminFormTemplateDtoToJson(this);
}
