// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_worker_run_status.dart';

part 'ai_worker_run_dto.g.dart';

@JsonSerializable()
class AiWorkerRunDto {
  const AiWorkerRunDto({
    required this.id,
    required this.roleId,
    required this.roleName,
    required this.status,
    required this.model,
    required this.total,
    required this.proposed,
    required this.failed,
    required this.inFlight,
    required this.costCents,
    required this.error,
    required this.createdAt,
    required this.finishedAt,
  });

  factory AiWorkerRunDto.fromJson(Map<String, Object?> json) =>
      _$AiWorkerRunDtoFromJson(json);

  final String id;
  final String roleId;
  final String roleName;
  final AiWorkerRunStatus status;
  final String model;
  final num total;
  final num proposed;
  final num failed;

  /// A Message Batch is being processed now.
  final bool inFlight;

  /// What the run cost so far, cents.
  final num costCents;
  final String? error;
  final DateTime createdAt;
  final DateTime? finishedAt;

  Map<String, Object?> toJson() => _$AiWorkerRunDtoToJson(this);
}
