// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'email_template_variable_dto.g.dart';

@JsonSerializable()
class EmailTemplateVariableDto {
  const EmailTemplateVariableDto({
    required this.name,
    required this.description,
    required this.sample,
    required this.requiredValue,
  });

  factory EmailTemplateVariableDto.fromJson(Map<String, Object?> json) =>
      _$EmailTemplateVariableDtoFromJson(json);

  final String name;
  final String description;
  final String sample;

  /// Must appear in an override.
  /// The name has been replaced because it contains a keyword. Original name: `required`.
  @JsonKey(name: 'required')
  final bool requiredValue;

  Map<String, Object?> toJson() => _$EmailTemplateVariableDtoToJson(this);
}
