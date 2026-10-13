// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_task_dto_kind.dart';
import 'case_task_dto_status.dart';
import 'case_task_event_dto.dart';
import 'workspace_file_dto.dart';

part 'case_task_dto.g.dart';

@JsonSerializable()
class CaseTaskDto {
  const CaseTaskDto({
    required this.id,
    required this.kind,
    required this.title,
    required this.status,
    required this.closed,
    required this.createdAt,
    required this.fileCount,
    required this.files,
    required this.events,
    this.description,
    this.doneAt,
  });

  factory CaseTaskDto.fromJson(Map<String, Object?> json) =>
      _$CaseTaskDtoFromJson(json);

  final String id;
  final CaseTaskDtoKind kind;
  final String title;
  final String? description;
  final CaseTaskDtoStatus status;
  final String? doneAt;
  final bool closed;
  final String createdAt;
  final int fileCount;
  final List<WorkspaceFileDto> files;
  final List<CaseTaskEventDto> events;

  Map<String, Object?> toJson() => _$CaseTaskDtoToJson(this);
}
