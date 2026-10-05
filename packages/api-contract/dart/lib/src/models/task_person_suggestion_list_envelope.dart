// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'task_person_suggestion_dto.dart';

part 'task_person_suggestion_list_envelope.g.dart';

@JsonSerializable()
class TaskPersonSuggestionListEnvelope {
  const TaskPersonSuggestionListEnvelope({required this.data, this.meta});

  factory TaskPersonSuggestionListEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$TaskPersonSuggestionListEnvelopeFromJson(json);

  final List<TaskPersonSuggestionDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$TaskPersonSuggestionListEnvelopeToJson(this);
}
