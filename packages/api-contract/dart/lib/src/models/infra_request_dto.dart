// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'infra_plan_dto.dart';
import 'infra_request_dto_status.dart';

part 'infra_request_dto.g.dart';

@JsonSerializable()
class InfraRequestDto {
  const InfraRequestDto({
    required this.id,
    required this.itemId,
    required this.itemName,
    required this.fromState,
    required this.toState,
    required this.changes,
    required this.status,
    required this.costDeltaUsd,
    required this.dryRun,
    required this.rollbackOf,
    required this.plan,
    required this.runUrl,
    required this.recorded,
    required this.error,
    required this.impact,
    required this.createdAt,
    required this.plannedAt,
    required this.expiresAt,
    required this.finishedAt,
  });

  factory InfraRequestDto.fromJson(Map<String, Object?> json) =>
      _$InfraRequestDtoFromJson(json);

  final String id;
  final String itemId;
  final String itemName;
  final String? fromState;
  final String toState;
  final dynamic changes;
  final InfraRequestDtoStatus status;
  final List<num> costDeltaUsd;
  final bool dryRun;
  final String? rollbackOf;
  final InfraPlanDto? plan;
  final String? runUrl;
  final String? recorded;
  final String? error;
  final String impact;
  final String createdAt;
  final String? plannedAt;
  final String? expiresAt;
  final String? finishedAt;

  Map<String, Object?> toJson() => _$InfraRequestDtoToJson(this);
}
