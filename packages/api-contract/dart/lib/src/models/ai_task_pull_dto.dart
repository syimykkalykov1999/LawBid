// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_task_pull_dto_state.dart';

part 'ai_task_pull_dto.g.dart';

@JsonSerializable()
class AiTaskPullDto {
  const AiTaskPullDto({
    required this.number,
    required this.url,
    required this.state,
    required this.merged,
  });

  factory AiTaskPullDto.fromJson(Map<String, Object?> json) =>
      _$AiTaskPullDtoFromJson(json);

  final num number;
  final String url;
  final AiTaskPullDtoState state;
  final bool merged;

  Map<String, Object?> toJson() => _$AiTaskPullDtoToJson(this);
}
