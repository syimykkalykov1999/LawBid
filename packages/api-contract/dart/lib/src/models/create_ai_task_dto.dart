// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_ai_task_dto.g.dart';

@JsonSerializable()
class CreateAiTaskDto {
  const CreateAiTaskDto({required this.title, required this.details});

  factory CreateAiTaskDto.fromJson(Map<String, Object?> json) =>
      _$CreateAiTaskDtoFromJson(json);

  final String title;
  final String details;

  Map<String, Object?> toJson() => _$CreateAiTaskDtoToJson(this);
}
