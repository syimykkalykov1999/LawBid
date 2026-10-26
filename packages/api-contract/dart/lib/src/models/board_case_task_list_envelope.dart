// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'board_case_task_dto.dart';
import 'response_meta_dto.dart';

part 'board_case_task_list_envelope.g.dart';

@JsonSerializable()
class BoardCaseTaskListEnvelope {
  const BoardCaseTaskListEnvelope({required this.data, this.meta});

  factory BoardCaseTaskListEnvelope.fromJson(Map<String, Object?> json) =>
      _$BoardCaseTaskListEnvelopeFromJson(json);

  final List<BoardCaseTaskDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$BoardCaseTaskListEnvelopeToJson(this);
}
