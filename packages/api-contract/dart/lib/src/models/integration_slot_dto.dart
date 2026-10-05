// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'integration_version_dto.dart';

part 'integration_slot_dto.g.dart';

@JsonSerializable()
class IntegrationSlotDto {
  const IntegrationSlotDto({
    required this.slot,
    required this.priority,
    required this.enabled,
    this.label,
    this.active,
    this.pending,
  });

  factory IntegrationSlotDto.fromJson(Map<String, Object?> json) =>
      _$IntegrationSlotDtoFromJson(json);

  final String slot;
  final String? label;
  final num priority;
  final bool enabled;
  final IntegrationVersionDto? active;
  final IntegrationVersionDto? pending;

  Map<String, Object?> toJson() => _$IntegrationSlotDtoToJson(this);
}
