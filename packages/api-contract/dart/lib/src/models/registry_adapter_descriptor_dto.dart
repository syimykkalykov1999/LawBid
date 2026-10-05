// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'registry_adapter_descriptor_dto_secret.dart';
import 'registry_adapter_descriptor_dto_type.dart';
import 'registry_field_descriptor_dto.dart';

part 'registry_adapter_descriptor_dto.g.dart';

@JsonSerializable()
class RegistryAdapterDescriptorDto {
  const RegistryAdapterDescriptorDto({
    required this.type,
    required this.label,
    required this.description,
    required this.fields,
    required this.secret,
    this.secretLabel,
  });

  factory RegistryAdapterDescriptorDto.fromJson(Map<String, Object?> json) =>
      _$RegistryAdapterDescriptorDtoFromJson(json);

  final RegistryAdapterDescriptorDtoType type;
  final String label;
  final String description;
  final List<RegistryFieldDescriptorDto> fields;
  final RegistryAdapterDescriptorDtoSecret secret;
  final String? secretLabel;

  Map<String, Object?> toJson() => _$RegistryAdapterDescriptorDtoToJson(this);
}
