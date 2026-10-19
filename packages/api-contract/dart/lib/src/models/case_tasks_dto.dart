// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_task_dto.dart';
import 'case_tasks_dto_role.dart';

part 'case_tasks_dto.g.dart';

@JsonSerializable()
class CaseTasksDto {
  const CaseTasksDto({
    required this.role,
    required this.forClient,
    required this.shared,
    required this.joint,
    required this.private,
    required this.canEdit,
  });

  factory CaseTasksDto.fromJson(Map<String, Object?> json) =>
      _$CaseTasksDtoFromJson(json);

  final CaseTasksDtoRole role;
  final List<CaseTaskDto> forClient;
  final List<CaseTaskDto> shared;

  /// Tasks of both sides (either one ticks them).
  final List<CaseTaskDto> joint;

  /// Attorney only; empty for the client.
  final List<CaseTaskDto> private;

  /// Audit 2026-10-19: false once the case is closed, or for an assistant without the "tasks" duty — the tasks are then read-only.
  final bool canEdit;

  Map<String, Object?> toJson() => _$CaseTasksDtoToJson(this);
}
