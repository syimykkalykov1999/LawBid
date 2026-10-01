// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'integration_dto_source.dart';
import 'integration_field_dto.dart';
import 'integration_version_dto.dart';

part 'integration_dto.g.dart';

@JsonSerializable()
class IntegrationDto {
  const IntegrationDto({
    required this.provider,
    required this.label,
    required this.description,
    required this.restartRequired,
    required this.testable,
    required this.fields,
    required this.source,
    required this.configured,
    this.warning,
    this.active,
    this.pending,
    this.envMasked,
  });

  factory IntegrationDto.fromJson(Map<String, Object?> json) =>
      _$IntegrationDtoFromJson(json);

  final String provider;
  final String label;
  final String description;
  final bool restartRequired;
  final String? warning;
  final bool testable;
  final List<IntegrationFieldDto> fields;
  final IntegrationDtoSource source;
  final bool configured;
  final IntegrationVersionDto? active;
  final IntegrationVersionDto? pending;

  /// Masked env values while the server env is the source.
  final Map<String, String>? envMasked;

  Map<String, Object?> toJson() => _$IntegrationDtoToJson(this);
}
