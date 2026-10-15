// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'board_case_task_dto_created_by_role.dart';
import 'board_case_task_dto_kind.dart';
import 'board_case_task_dto_status.dart';
import 'board_case_task_dto_viewer_role.dart';
import 'case_task_event_dto.dart';
import 'case_task_item_dto.dart';
import 'workspace_file_dto.dart';

part 'board_case_task_dto.g.dart';

@JsonSerializable()
class BoardCaseTaskDto {
  const BoardCaseTaskDto({
    required this.id,
    required this.kind,
    required this.createdByRole,
    required this.title,
    required this.status,
    required this.closed,
    required this.createdAt,
    required this.fileCount,
    required this.files,
    required this.events,
    required this.items,
    required this.itemsDone,
    required this.itemsTotal,
    required this.caseId,
    required this.caseTitle,
    required this.viewerRole,
    required this.canTick,
    this.description,
    this.doneAt,
    this.closedAt,
    this.dueAt,
    this.practiceCode,
  });

  factory BoardCaseTaskDto.fromJson(Map<String, Object?> json) =>
      _$BoardCaseTaskDtoFromJson(json);

  final String id;
  final BoardCaseTaskDtoKind kind;
  final BoardCaseTaskDtoCreatedByRole createdByRole;
  final String title;
  final String? description;
  final BoardCaseTaskDtoStatus status;
  final String? doneAt;
  final bool closed;
  final String? closedAt;
  final String? dueAt;
  final String createdAt;
  final int fileCount;
  final List<WorkspaceFileDto> files;
  final List<CaseTaskEventDto> events;
  final List<CaseTaskItemDto> items;
  final int itemsDone;
  final int itemsTotal;
  final String caseId;
  final String caseTitle;
  final String? practiceCode;
  final BoardCaseTaskDtoViewerRole viewerRole;

  /// The viewer may tick it (the rules of the case workspace).
  final bool canTick;

  Map<String, Object?> toJson() => _$BoardCaseTaskDtoToJson(this);
}
