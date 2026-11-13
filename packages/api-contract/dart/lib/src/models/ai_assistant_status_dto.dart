// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_run_dto.dart';
import 'ai_task_dto.dart';
import 'ai_worker_model.dart';

part 'ai_assistant_status_dto.g.dart';

@JsonSerializable()
class AiAssistantStatusDto {
  const AiAssistantStatusDto({
    required this.mode,
    required this.connected,
    required this.allowed,
    required this.reason,
    required this.tasksAllowed,
    required this.tasksReason,
    required this.monthUsd,
    required this.maxUsd,
    required this.tasks,
    required this.tasksError,
    required this.runs,
    required this.model,
    required this.models,
  });

  factory AiAssistantStatusDto.fromJson(Map<String, Object?> json) =>
      _$AiAssistantStatusDtoFromJson(json);

  /// ai.assistant_mode: off | on | auto
  final String mode;

  /// The GitHub App (github_infra) is saved.
  final bool connected;

  /// A run may start now.
  final bool allowed;

  /// Why not, in words.
  final String? reason;

  /// Owner tasks may be sent now (only in Вкл; Авто = the scheduled look only).
  final bool tasksAllowed;

  /// Why not.
  final String? tasksReason;
  final num monthUsd;
  final num maxUsd;
  final List<AiTaskDto> tasks;
  final String? tasksError;
  final List<AiRunDto> runs;

  /// ai.assistant_model: the Claude model of the runs.
  final AiWorkerModel model;

  /// Models the owner may pick.
  final List<String> models;

  Map<String, Object?> toJson() => _$AiAssistantStatusDtoToJson(this);
}
