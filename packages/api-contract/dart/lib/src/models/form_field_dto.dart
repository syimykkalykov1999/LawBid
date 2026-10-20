// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'form_field_dto_prefill.dart';
import 'form_field_dto_type.dart';

part 'form_field_dto.g.dart';

@JsonSerializable()
class FormFieldDto {
  const FormFieldDto({
    required this.key,
    required this.type,
    required this.requiredValue,
    required this.label,
    this.prefill,
  });

  factory FormFieldDto.fromJson(Map<String, Object?> json) =>
      _$FormFieldDtoFromJson(json);

  final String key;
  final FormFieldDtoType type;

  /// The name has been replaced because it contains a keyword. Original name: `required`.
  @JsonKey(name: 'required')
  final bool requiredValue;
  final Map<String, String> label;

  /// Filled in by the app from the case.
  final FormFieldDtoPrefill? prefill;

  Map<String, Object?> toJson() => _$FormFieldDtoToJson(this);
}
