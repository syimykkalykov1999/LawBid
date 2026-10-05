// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'attorney_task_kind.dart';
import 'attorney_task_status.dart';
import 'task_file_dto.dart';
import 'task_person_dto.dart';
import 'task_place_dto.dart';
import 'task_priority.dart';
import 'task_repeat.dart';
import 'task_step_dto.dart';

part 'task_dto.g.dart';

@JsonSerializable()
class TaskDto {
  const TaskDto({
    required this.createdAt,
    required this.kind,
    required this.title,
    required this.status,
    required this.files,
    required this.id,
    required this.assignedToMe,
    required this.repeat,
    required this.canEdit,
    required this.people,
    required this.places,
    required this.keepForever,
    required this.canComplete,
    required this.steps,
    required this.priority,
    required this.canDelete,
    this.createdByName,
    this.rescheduledTo,
    this.doneAt,
    this.outcomeNote,
    this.contactEmail,
    this.contactPhone,
    this.contactName,
    this.caseTitle,
    this.repeatUntil,
    this.remindBeforeMin,
    this.assigneeMembershipId,
    this.assigneeName,
    this.caseId,
    this.conversationId,
    this.archivedAt,
    this.dueAt,
    this.purgeAt,
    this.notes,
    this.location,
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
  final String? contactEmail;
  final List<TaskFileDto> files;
  final AttorneyTaskStatus status;
  final String? outcomeNote;
  final String? rescheduledTo;
  final String? createdByName;

  /// The viewer may delete this task.
  final bool canDelete;
  final String createdAt;
  final String? doneAt;
  final List<TaskStepDto> steps;
  final List<TaskPlaceDto> places;
  final List<TaskPersonDto> people;
  final TaskPriority priority;
  final TaskRepeat repeat;
  final String? repeatUntil;
  final num? remindBeforeMin;
  final String? assigneeMembershipId;
  final String? assigneeName;

  /// Assigned to the assistant looking at it.
  final bool assignedToMe;
  final String? conversationId;
  final String? archivedAt;
  final bool keepForever;

  /// When the archive cleanup removes it (null: never).
  final String? purgeAt;

  /// The viewer may check it off.
  final bool canComplete;

  /// The viewer may edit it.
  final bool canEdit;

  Map<String, Object?> toJson() => _$TaskDtoToJson(this);
}
