// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'attorney_task_kind.dart';
import 'task_person_input_dto.dart';
import 'task_place_input_dto.dart';
import 'task_priority.dart';
import 'task_repeat.dart';
import 'task_step_input_dto.dart';

part 'create_task_dto.g.dart';

@JsonSerializable()
class CreateTaskDto {
  const CreateTaskDto({
    required this.kind,
    required this.title,
    this.places,
    this.people,
    this.priority,
    this.repeat,
    this.repeatUntil,
    this.remindBeforeMin,
    this.assigneeMembershipId,
    this.conversationId,
    this.keepForever,
    this.notes,
    this.dueAt,
    this.location,
    this.caseId,
    this.contactName,
    this.contactPhone,
    this.contactEmail,
    this.fileIds,
    this.steps,
  });

  factory CreateTaskDto.fromJson(Map<String, Object?> json) =>
      _$CreateTaskDtoFromJson(json);

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
  final AttorneyTaskKind kind;
  final String title;
  final String? notes;
  final DateTime? dueAt;
  final String? location;
  final String? caseId;
  final String? contactName;
  final String? contactPhone;

  /// Email tasks: the address.
  final String? contactEmail;
  final List<String>? fileIds;

  /// Owner 2026-10-01: a checklist — as many steps as needed.
  final List<TaskStepInputDto>? steps;

  Map<String, Object?> toJson() => _$CreateTaskDtoToJson(this);
}
