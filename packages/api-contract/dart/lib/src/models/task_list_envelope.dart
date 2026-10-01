// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'task_dto.dart';

part 'task_list_envelope.g.dart';

@JsonSerializable()
class TaskListEnvelope {
  const TaskListEnvelope({required this.data, this.meta});

  factory TaskListEnvelope.fromJson(Map<String, Object?> json) =>
      _$TaskListEnvelopeFromJson(json);

  final List<TaskDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$TaskListEnvelopeToJson(this);
}
