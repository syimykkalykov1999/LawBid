// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'registry_check_queued_dto_kind.dart';
import 'registry_check_queued_dto_status.dart';

part 'registry_check_queued_dto.g.dart';

@JsonSerializable()
class RegistryCheckQueuedDto {
  const RegistryCheckQueuedDto({
    required this.licenseId,
    required this.checkId,
    required this.kind,
    required this.status,
    required this.queuedAt,
  });

  factory RegistryCheckQueuedDto.fromJson(Map<String, Object?> json) =>
      _$RegistryCheckQueuedDtoFromJson(json);

  final String licenseId;

  /// Id of the queued lookup; the same id while one is still running for this license.
  final String checkId;

  /// registry = look up only; recheck = a non-pass also queues the license for review.
  final RegistryCheckQueuedDtoKind kind;
  final RegistryCheckQueuedDtoStatus status;
  final DateTime queuedAt;

  Map<String, Object?> toJson() => _$RegistryCheckQueuedDtoToJson(this);
}
