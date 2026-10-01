// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'task_step_status.dart';

part 'update_task_step_dto.g.dart';

@JsonSerializable()
class UpdateTaskStepDto {
  const UpdateTaskStepDto({this.status, this.note, this.dueAt});

  factory UpdateTaskStepDto.fromJson(Map<String, Object?> json) =>
      _$UpdateTaskStepDtoFromJson(json);

  final TaskStepStatus? status;
  final String? note;

  /// Move the step to another time (attorney or assistant).
  final DateTime? dueAt;

  Map<String, Object?> toJson() => _$UpdateTaskStepDtoToJson(this);
}
