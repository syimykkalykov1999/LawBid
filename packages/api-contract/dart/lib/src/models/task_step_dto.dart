// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'attorney_task_kind.dart';
import 'attorney_task_status.dart';

part 'task_step_dto.g.dart';

@JsonSerializable()
class TaskStepDto {
  const TaskStepDto({
    required this.id,
    required this.position,
    required this.title,
    required this.status,
    this.kind,
    this.dueAt,
    this.location,
    this.contactName,
    this.contactPhone,
    this.contactEmail,
    this.note,
    this.doneAt,
    this.createdByName,
  });

  factory TaskStepDto.fromJson(Map<String, Object?> json) =>
      _$TaskStepDtoFromJson(json);

  final String id;
  final num position;
  final AttorneyTaskKind? kind;
  final String title;
  final String? dueAt;
  final String? location;
  final String? contactName;
  final String? contactPhone;
  final String? contactEmail;
  final AttorneyTaskStatus status;
  final String? note;
  final String? doneAt;
  final String? createdByName;

  Map<String, Object?> toJson() => _$TaskStepDtoToJson(this);
}
