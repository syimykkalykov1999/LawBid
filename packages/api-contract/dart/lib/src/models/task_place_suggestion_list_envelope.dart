// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'task_place_suggestion_dto.dart';

part 'task_place_suggestion_list_envelope.g.dart';

@JsonSerializable()
class TaskPlaceSuggestionListEnvelope {
  const TaskPlaceSuggestionListEnvelope({required this.data, this.meta});

  factory TaskPlaceSuggestionListEnvelope.fromJson(Map<String, Object?> json) =>
      _$TaskPlaceSuggestionListEnvelopeFromJson(json);

  final List<TaskPlaceSuggestionDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$TaskPlaceSuggestionListEnvelopeToJson(this);
}
