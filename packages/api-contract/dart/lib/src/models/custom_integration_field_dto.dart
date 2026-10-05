// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'custom_integration_field_dto.g.dart';

@JsonSerializable()
class CustomIntegrationFieldDto {
  const CustomIntegrationFieldDto({
    required this.name,
    required this.label,
    required this.secret,
    required this.requiredValue,
  });

  factory CustomIntegrationFieldDto.fromJson(Map<String, Object?> json) =>
      _$CustomIntegrationFieldDtoFromJson(json);

  final String name;
  final String label;

  /// Write-only and masked when true.
  final bool secret;

  /// The name has been replaced because it contains a keyword. Original name: `required`.
  @JsonKey(name: 'required')
  final bool requiredValue;

  Map<String, Object?> toJson() => _$CustomIntegrationFieldDtoToJson(this);
}
