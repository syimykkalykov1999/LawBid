// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'attorney_task_kind.dart';
import 'attorney_task_status.dart';
import 'task_file_dto.dart';

part 'task_dto.g.dart';

@JsonSerializable()
class TaskDto {
  const TaskDto({
    required this.id,
    required this.kind,
    required this.title,
    required this.files,
    required this.status,
    required this.createdAt,
    this.notes,
    this.dueAt,
    this.location,
    this.caseId,
    this.caseTitle,
    this.contactName,
    this.contactPhone,
    this.outcomeNote,
    this.rescheduledTo,
    this.createdByName,
    this.doneAt,
  });

  factory TaskDto.fromJson(Map<String, Object?> json) =>
      _$TaskDtoFromJson(json);

  final String id;
  final AttorneyTaskKind kind;
  final String title;
  final String? notes;
  final String? dueAt;
  final String? location;
  final String? caseId;
  final String? caseTitle;
  final String? contactName;
  final String? contactPhone;
  final List<TaskFileDto> files;
  final AttorneyTaskStatus status;
  final String? outcomeNote;
  final String? rescheduledTo;
  final String? createdByName;
  final String createdAt;
  final String? doneAt;

  Map<String, Object?> toJson() => _$TaskDtoToJson(this);
}
