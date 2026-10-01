// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'attorney_task_kind.dart';

part 'task_step_input_dto.g.dart';

@JsonSerializable()
class TaskStepInputDto {
  const TaskStepInputDto({
    required this.title,
    this.kind,
    this.dueAt,
    this.location,
    this.contactName,
    this.contactPhone,
    this.contactEmail,
  });

  factory TaskStepInputDto.fromJson(Map<String, Object?> json) =>
      _$TaskStepInputDtoFromJson(json);

  final AttorneyTaskKind? kind;
  final String title;
  final DateTime? dueAt;
  final String? location;
  final String? contactName;
  final String? contactPhone;
  final String? contactEmail;

  Map<String, Object?> toJson() => _$TaskStepInputDtoToJson(this);
}
