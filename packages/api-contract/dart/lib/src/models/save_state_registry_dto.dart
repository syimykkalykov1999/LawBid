// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'save_state_registry_dto_adapter.dart';

part 'save_state_registry_dto.g.dart';

@JsonSerializable()
class SaveStateRegistryDto {
  const SaveStateRegistryDto({
    required this.adapter,
    required this.enabled,
    this.config,
    this.secret,
    this.clearSecret,
    this.testBarNumber,
  });

  factory SaveStateRegistryDto.fromJson(Map<String, Object?> json) =>
      _$SaveStateRegistryDtoFromJson(json);

  final SaveStateRegistryDtoAdapter adapter;
  final bool enabled;
  final Map<String, String>? config;

  /// A new key; empty keeps the saved one.
  final String? secret;
  final bool? clearSecret;
  final String? testBarNumber;

  Map<String, Object?> toJson() => _$SaveStateRegistryDtoToJson(this);
}
