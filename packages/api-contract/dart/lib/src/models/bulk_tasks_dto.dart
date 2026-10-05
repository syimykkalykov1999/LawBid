// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bulk_tasks_dto_status.dart';
import 'task_bulk_action.dart';
import 'task_priority.dart';

part 'bulk_tasks_dto.g.dart';

@JsonSerializable()
class BulkTasksDto {
  const BulkTasksDto({
    required this.ids,
    required this.action,
    this.status,
    this.priority,
    this.assigneeMembershipId,
  });

  factory BulkTasksDto.fromJson(Map<String, Object?> json) =>
      _$BulkTasksDtoFromJson(json);

  final List<String> ids;
  final TaskBulkAction action;
  final BulkTasksDtoStatus? status;
  final TaskPriority? priority;
  final String? assigneeMembershipId;

  Map<String, Object?> toJson() => _$BulkTasksDtoToJson(this);
}
