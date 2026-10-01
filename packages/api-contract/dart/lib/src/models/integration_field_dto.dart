// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'integration_field_dto.g.dart';

@JsonSerializable()
class IntegrationFieldDto {
  const IntegrationFieldDto({
    required this.name,
    required this.label,
    required this.secret,
    required this.requiredValue,
    this.hint,
  });

  factory IntegrationFieldDto.fromJson(Map<String, Object?> json) =>
      _$IntegrationFieldDtoFromJson(json);

  final String name;
  final String label;
  final bool secret;

  /// The name has been replaced because it contains a keyword. Original name: `required`.
  @JsonKey(name: 'required')
  final bool requiredValue;
  final String? hint;

  Map<String, Object?> toJson() => _$IntegrationFieldDtoToJson(this);
}
