// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'update_task_status_dto_status.dart';

part 'update_task_status_dto.g.dart';

@JsonSerializable()
class UpdateTaskStatusDto {
  const UpdateTaskStatusDto({
    required this.status,
    this.outcomeNote,
    this.rescheduleTo,
  });

  factory UpdateTaskStatusDto.fromJson(Map<String, Object?> json) =>
      _$UpdateTaskStatusDtoFromJson(json);

  final UpdateTaskStatusDtoStatus status;
  final String? outcomeNote;

  /// not_done: move it to this moment (stays open there).
  final DateTime? rescheduleTo;

  Map<String, Object?> toJson() => _$UpdateTaskStatusDtoToJson(this);
}
