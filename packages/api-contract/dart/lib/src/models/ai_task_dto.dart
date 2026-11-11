// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_task_dto_state.dart';
import 'ai_task_pull_dto.dart';

part 'ai_task_dto.g.dart';

@JsonSerializable()
class AiTaskDto {
  const AiTaskDto({
    required this.number,
    required this.title,
    required this.state,
    required this.url,
    required this.createdAt,
    required this.pulls,
  });

  factory AiTaskDto.fromJson(Map<String, Object?> json) =>
      _$AiTaskDtoFromJson(json);

  final num number;
  final String title;
  final AiTaskDtoState state;
  final String url;
  final DateTime createdAt;
  final List<AiTaskPullDto> pulls;

  Map<String, Object?> toJson() => _$AiTaskDtoToJson(this);
}
