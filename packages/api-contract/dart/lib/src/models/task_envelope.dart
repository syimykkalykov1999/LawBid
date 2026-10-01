// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'task_dto.dart';

part 'task_envelope.g.dart';

@JsonSerializable()
class TaskEnvelope {
  const TaskEnvelope({required this.data, this.meta});

  factory TaskEnvelope.fromJson(Map<String, Object?> json) =>
      _$TaskEnvelopeFromJson(json);

  final TaskDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$TaskEnvelopeToJson(this);
}
