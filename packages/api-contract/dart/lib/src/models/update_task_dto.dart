// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'attorney_task_kind.dart';
import 'task_person_input_dto.dart';
import 'task_place_input_dto.dart';
import 'task_priority.dart';
import 'task_repeat.dart';

part 'update_task_dto.g.dart';

@JsonSerializable()
class UpdateTaskDto {
  const UpdateTaskDto({
    this.places,
    this.people,
    this.priority,
    this.repeat,
    this.repeatUntil,
    this.remindBeforeMin,
    this.assigneeMembershipId,
    this.conversationId,
    this.keepForever,
    this.kind,
    this.title,
    this.notes,
    this.dueAt,
    this.clearDueAt,
    this.caseId,
    this.clearCaseId,
    this.clearRemind,
    this.clearAssignee,
    this.clearConversation,
    this.clearRepeatUntil,
    this.location,
    this.contactName,
    this.contactPhone,
    this.contactEmail,
    this.fileIds,
  });

  factory UpdateTaskDto.fromJson(Map<String, Object?> json) =>
      _$UpdateTaskDtoFromJson(json);

  final List<TaskPlaceInputDto>? places;
  final List<TaskPersonInputDto>? people;
  final TaskPriority? priority;
  final TaskRepeat? repeat;

  /// Repeat until.
  final DateTime? repeatUntil;

  /// Reminder this many minutes before the time (0 = at it).
  final num? remindBeforeMin;

  /// Assign to an assistant of the team.
  final String? assigneeMembershipId;

  /// The chat it is about.
  final String? conversationId;

  /// Never removed from the archive.
  final bool? keepForever;
  final AttorneyTaskKind? kind;
  final String? title;
  final String? notes;
  final DateTime? dueAt;

  /// true removes the time.
  final bool? clearDueAt;

  /// Link another case.
  final String? caseId;

  /// Unlink the case.
  final bool? clearCaseId;

  /// Owner 2026-10-05: no reminder / no assignee / no chat / no end.
  final bool? clearRemind;
  final bool? clearAssignee;
  final bool? clearConversation;
  final bool? clearRepeatUntil;
  final String? location;
  final String? contactName;
  final String? contactPhone;
  final String? contactEmail;
  final List<String>? fileIds;

  Map<String, Object?> toJson() => _$UpdateTaskDtoToJson(this);
}
