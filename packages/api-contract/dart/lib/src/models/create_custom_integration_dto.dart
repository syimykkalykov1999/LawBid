// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'custom_integration_field_dto.dart';

part 'create_custom_integration_dto.g.dart';

@JsonSerializable()
class CreateCustomIntegrationDto {
  const CreateCustomIntegrationDto({
    required this.id,
    required this.label,
    required this.fields,
    this.description,
  });

  factory CreateCustomIntegrationDto.fromJson(Map<String, Object?> json) =>
      _$CreateCustomIntegrationDtoFromJson(json);

  /// Latin letters, digits, _ ; stored as custom_<id>.
  final String id;
  final String label;
  final String? description;
  final List<CustomIntegrationFieldDto> fields;

  Map<String, Object?> toJson() => _$CreateCustomIntegrationDtoToJson(this);
}
