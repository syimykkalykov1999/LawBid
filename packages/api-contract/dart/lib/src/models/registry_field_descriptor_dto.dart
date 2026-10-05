// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'registry_field_descriptor_dto.g.dart';

@JsonSerializable()
class RegistryFieldDescriptorDto {
  const RegistryFieldDescriptorDto({
    required this.name,
    required this.label,
    required this.requiredValue,
    this.placeholder,
    this.help,
    this.options,
  });

  factory RegistryFieldDescriptorDto.fromJson(Map<String, Object?> json) =>
      _$RegistryFieldDescriptorDtoFromJson(json);

  final String name;
  final String label;

  /// The name has been replaced because it contains a keyword. Original name: `required`.
  @JsonKey(name: 'required')
  final bool requiredValue;
  final String? placeholder;
  final String? help;
  final List<String>? options;

  Map<String, Object?> toJson() => _$RegistryFieldDescriptorDtoToJson(this);
}
